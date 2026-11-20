// Pure server-side render of a SiteSpec. No network, no clock, no randomness:
// the same spec and context always give the same bytes. It trusts nothing it
// is handed: all text goes through React's escaping, links are re-checked,
// colours and fonts are re-resolved from the allowlists.

import { renderToStaticMarkup } from "react-dom/server";
import type { Page, SiteSpec } from "@hl-bos/sitegen-spec";
import { Body } from "./body.tsx";
import { buildHeadTags } from "./seo.tsx";
import { buildCss } from "./theme.ts";
import type {
  RenderContext,
  RenderedPage,
  RenderedSite,
  SitemapEntry,
} from "./types.ts";
import { canonicalOrigin } from "./url.ts";

export function renderSite(spec: SiteSpec, ctx: RenderContext): RenderedSite {
  const origin = canonicalOrigin(ctx.origin);
  const css = buildCss(spec.theme);
  const pathOf = (p: Page) => (p === spec.pages[0] ? "/" : `/${p.slug}`);

  const pages: RenderedPage[] = spec.pages.map((page, i) => {
    const path = pathOf(page);
    const headTags = buildHeadTags(
      spec,
      page,
      i === 0,
      `${origin}${path === "/" ? "/" : path}`,
      ctx,
    );
    const body = renderToStaticMarkup(
      <Body spec={spec} ctx={ctx} page={page} pages={spec.pages} pathOf={pathOf} />,
    );
    return {
      slug: page.slug,
      path,
      title: page.title,
      headTags,
      html: `<!doctype html><html lang="en"><head>${headTags}<style>${css}</style></head><body>${body}</body></html>`,
    };
  });

  const home = pages[0] as RenderedPage;
  const sitemapEntries: SitemapEntry[] = pages.map((p) => ({
    loc: `${origin}${p.path}`,
    ...(ctx.lastModified !== undefined && { lastmod: ctx.lastModified }),
  }));
  return { html: home.html, headTags: home.headTags, pages, sitemapEntries };
}
