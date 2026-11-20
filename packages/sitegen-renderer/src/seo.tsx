import { renderToStaticMarkup } from "react-dom/server";
import { VERTICALS, type Page, type SiteSpec } from "@hl-bos/sitegen-spec";
import { DAY_NAMES, safeJsonForScript, sortHours } from "./format.ts";
import { safeAssetUrl } from "./url.ts";
import type { RenderContext } from "./types.ts";

/** schema.org JSON-LD with ONLY facts present in the spec. */
export function buildJsonLd(spec: SiteSpec, url: string): Record<string, unknown> {
  const p = spec.profile;
  const a = p.address;
  const address = a && {
    "@type": "PostalAddress",
    ...(a.street && { streetAddress: a.street }),
    ...(a.city && { addressLocality: a.city }),
    ...(a.region && { addressRegion: a.region }),
    ...(a.postalCode && { postalCode: a.postalCode }),
  };
  const open = sortHours(p.hours).filter((h) => !h.closed && h.open && h.close);
  return {
    "@context": "https://schema.org",
    "@type": VERTICALS[spec.vertical].schemaOrgType,
    name: p.businessName,
    telephone: p.phone,
    url,
    ...(address && Object.keys(address).length > 1 && { address }),
    ...(open.length > 0 && {
      openingHoursSpecification: open.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_NAMES[h.day],
        opens: h.open,
        closes: h.close,
      })),
    }),
    ...(p.services.length > 0 && {
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Services",
        itemListElement: p.services.map((s) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: s.name },
        })),
      },
    }),
  };
}

/** The <head> tags for one page, as markup. Everything is escaped by React except the JSON-LD, which is escaped by safeJsonForScript. */
export function buildHeadTags(
  spec: SiteSpec,
  page: Page,
  isHome: boolean,
  canonical: string,
  ctx: RenderContext,
): string {
  const title = isHome
    ? spec.seo.title
    : `${page.title} | ${spec.profile.businessName}`;
  const description = spec.seo.description;
  const image = safeAssetUrl(ctx.assets?.heroUrl) ?? safeAssetUrl(ctx.assets?.logoUrl);
  return (
    renderToStaticMarkup(
      <>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description !== "" && <meta name="description" content={description} />}
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={spec.profile.businessName} />
        <meta property="og:title" content={title} />
        {description !== "" && <meta property="og:description" content={description} />}
        <meta property="og:url" content={canonical} />
        {image && <meta property="og:image" content={image} />}
      </>,
    ).replace("<meta charSet=", "<meta charset=") +
    `<script type="application/ld+json">${safeJsonForScript(buildJsonLd(spec, canonical))}</script>`
  );
}
