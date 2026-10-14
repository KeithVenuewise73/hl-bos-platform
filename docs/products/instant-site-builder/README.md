# HLG Instant Site Builder — Phase 2

Turns a Presence Scanner lead into a one-page **demo** website the business
owner can be shown. Internal: built and previewed in the local Development
Control Center. It never publishes a page, registers a domain or contacts
anyone.

| Where             | What                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Engine            | `packages/site-builder`                                                                         |
| Console           | Lead Card → **Build demo site**; `/presence/[id]/demo` (preview, edit, approve, checklist, ZIP) |
| Drafts on disk    | `apps/control-center/.data/site-builder/` (gitignored), one draft per lead                      |
| Claude (optional) | Connections page → `ANTHROPIC_API_KEY` in `.env.local` (gitignored)                             |

## What was reused, not rebuilt

| Need           | Existing part reused                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| Page design    | The shared HLG static-site design (ddhhomeservices.com and five sibling sites)      |
| Facts and gaps | The Presence Scanner lead (`@hl-bos/presence-scanner`)                              |
| Claude copy    | Hype Video's writer pattern: `claude-opus-5-5`, structured output, refusal fallback |
| ZIP download   | JerseySort's streaming ZIP writer                                                   |
| Lead stage     | Building moves the lead to **Demo built** (never backwards)                         |

## What a demo contains

Demo banner · header · hero with Call / Text / primary action · services or
menu (marked **Sample**) · about (marked **Sample**) · how to reach them ·
optional promo-video placeholder (off by default) · an inert contact form ·
footer stating it is a demo, not affiliated until the owner approves.
SEO title, meta description, Open Graph tags and LocalBusiness JSON-LD (name,
phone, address only).

Templates: **contractor** (roofing, plumbing, electrical, paving/masonry,
landscaping, HVAC, painting, general), **salon/barber** (barber, nail, hair),
**restaurant/bar** (pizzeria, bar & grill, general). Trainer and youth-sports
templates come later; those leads say so.

## Honesty rules, enforced in code

- **Facts only from the lead.** Name, phone, address, directions and the Google
  rating come from the scanner record. What we cannot know (the services, the
  story) is marked **Sample** on the page until a reviewer replaces it.
- **Fabrication guard** (`validate.ts`) on every word — template, Claude and
  reviewer edits alike: no prices, guarantees, "free", superlatives or awards,
  credentials, history, availability claims, ratings or reviews, links, or
  numbers that are not the business's own.
- **Ratings:** only the real Google rating, attributed "Source: Google Maps",
  no review text, never in JSON-LD. Imported ratings are never shown.
- **Never public:** `noindex, nofollow`; the preview is served only by the
  local console, in a sandboxed frame, with a CSP that forbids scripts and
  form posts, and `X-Robots-Tag: noindex`.
- **Approval is internal** ("fit to show the owner"). Editing an approved demo
  withdraws approval.

## Launch checklist

Derived from the lead's findings (`checklist.ts`): owner content approval,
domain (keep theirs, or one registered in the business's own name — HLG never
registers a prospect's name), hosting (**CEO decision**), Google profile
fixes, calls and texts, booking or ordering (using tools they already have),
where form leads go (**CEO decision**), honest review requests, measurement.

## Known limitations

- Copy is from the template writer until an Anthropic key is added; the Claude
  writer has only been tested with an injected client.
- No photos: the demo uses no images until the owner supplies their own.
- No hosting, domains or publishing — by design for this phase.
