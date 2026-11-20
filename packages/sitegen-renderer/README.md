# @hl-bos/sitegen-renderer

SiteSpec in, static HTML out. A pure, server-side render with
`react-dom/server`: no network, no clock, no randomness, **no client-side
JavaScript** (the only `<script>` is one `application/ld+json` block). The host
resolves asset ids to URLs and passes them in `ctx`; the renderer fetches
nothing and renders nothing that is not in the spec.

| File         | Responsibility                                                               |
| ------------ | ---------------------------------------------------------------------------- |
| `render.tsx` | `renderSite(spec, ctx)` -> `{ html, headTags, pages, sitemapEntries }`       |
| `body.tsx`   | The barber template: header, hero, sections, contact buttons, footer         |
| `seo.tsx`    | Head tags (title, description, canonical, Open Graph) and JSON-LD            |
| `theme.ts`   | Colour tokens (`onColor`-derived text colours), the inlined mobile-first CSS |
| `format.ts`  | Prices, times, sorted hours, JSON-LD escaping (`<` becomes `<`)              |
| `url.ts`     | Asset URL and canonical-origin checks                                        |

```
pnpm --filter @hl-bos/sitegen-renderer typecheck
pnpm --filter @hl-bos/sitegen-renderer test
# to look at the output (written outside the repo):
SITEGEN_DEMO_DIR=/some/dir pnpm --filter @hl-bos/sitegen-renderer test
```

## Honest limits

- Defence in depth, not a substitute for validation: the renderer escapes all
  text, drops unsafe links and asset URLs, and re-resolves colours and fonts from
  allowlists, but callers should still validate with `@hl-bos/sitegen-spec`.
- Contrast is guaranteed for the text/background pairs in `TEXT_PAIRS` (tested
  with random brand colours). A logo image is not analysed; a logo that is
  invisible on white is a design problem the renderer cannot see.
- Performance, accessibility and SEO scores (e.g. Lighthouse) are **not
  measured** by this package.
- Prices render with `$` (spec v1 has no currency). Section headings default to
  fixed English labels (Services, Hours, Contact...).
- Gallery items whose image URL the host did not supply are skipped.
