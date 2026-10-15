# Premium Business Sites — Phase 3B

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-10-15
**Status:** Built and tested. The HLG Business Transformation and HSCS premium drafts
are private, on the computer that builds them, and await your design review. Nothing
is published, deployed, migrated or configured.

## Two website products

|               | Express Demo                                  | Premium Business Site                                                             |
| ------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| For           | First sales conversations with prospects      | HLG's own companies and paying clients                                            |
| Built from    | A Presence Scanner lead                       | A verified Business Profile                                                       |
| Pages         | One                                           | Six: Home, Services, Industries & solutions, About, Assessment, Privacy readiness |
| Look          | The shared one-page template, vertical accent | A theme preset with its own type, colour and hero composition                     |
| Copy          | Template writer (or Claude); samples marked   | Verified profile content; drafted items marked _To confirm_                       |
| Time to build | Under a second                                | Under a second                                                                    |
| Where         | Lead Card → _Build demo site_                 | Business Profile → _Build Premium Business Site_ → `/profiles/[id]/premium`       |

The Express Demo is unchanged: its output is pinned byte for byte by the golden files
recorded before Phase 3A.

## How the premium system is put together

`packages/site-builder/src/premium/`

| File            | Responsibility                                                                            |
| --------------- | ----------------------------------------------------------------------------------------- |
| `themes.ts`     | Theme presets (not businesses). Every text/background pair is tested against WCAG 2.2 AA. |
| `content.ts`    | The site's content, from verified profile fields only; frozen into each draft.            |
| `render.ts`     | Shared components and the six pages. No business is named in any component.               |
| `css.ts`        | One stylesheet per theme: type scale, layout, focus rings, reduced motion.                |
| `review.ts`     | Accessibility, performance and completeness reviews of the pages that would ship.         |
| `draft.ts`      | Versioned drafts, approval (publishes nothing), launch readiness, ZIP, claims check.      |
| `fonts-node.ts` | Reading the bundled fonts (Node only).                                                    |

**Themes.** _Atelier_ (charcoal, brass, cream; Fraunces display) and _Meridian_ (navy,
steel, controlled teal; Archivo display), both with Inter for body text. A profile picks
one in the Business Profile editor. New themes are new entries in `themes.ts`.

**Fonts.** Inter, Fraunces and Archivo are bundled under
`packages/site-builder/assets/fonts` (SIL Open Font License 1.1; the licences ship in the
ZIP). No remote fonts, scripts, images or trackers.

**No scripts.** The mobile menu is a `<details>` disclosure, which works with a
keyboard and screen readers without JavaScript. The contact form is a disabled
fieldset with no action and no submit button.

## The two drafts

|                                | HLG Business Transformation                                                                                                  | Herman Supply Chain Solutions                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Theme                          | Atelier                                                                                                                      | Meridian                                                             |
| Headline                       | “Better digital presence, customer acquisition and operating systems.” (the approved positioning, condensed)                 | “Transportation & Operations Consulting Supported by AI”             |
| Credibility                    | —                                                                                                                            | “35 Years of Operational Experience. Enhanced by AI.”                |
| Hero composition               | The assessment, as a layered card of the first four services                                                                 | The operating chain (manufacturing → white glove) as a route diagram |
| Calls to action                | Request a Business Transformation Assessment · Call HLG                                                                      | Request an operations assessment · Call HSCS                         |
| Phone                          | (716) 220-7354                                                                                                               | (716) 220-7354                                                       |
| Planned address (display only) | transform.hermanlegacygroup.com                                                                                              | hermansupplychainsolutions.com                                       |
| Services                       | Ten, from the Phase 3B brief                                                                                                 | Ten, from the HSCS Commercial Foundation §6                          |
| Process                        | — (none approved)                                                                                                            | Assess · Analyze · Recommend · Transform (Foundation §9)             |
| Industries                     | Four, marked _To confirm_                                                                                                    | Five tier-1 verticals (Foundation §7.1), no employer names           |
| Products                       | Presence Scanner, Instant Site Builder: **Pilot**. TakeoutOS, SalonOS / BarberOS, Contractor Performance System: **Planned** | —                                                                    |
| Missing                        | Business email, service area, privacy policy, case studies                                                                   | Business email, service area, privacy policy, case studies           |

Sources for every fact: `packages/site-builder/src/hlg-profiles.ts` and
`docs/products/hlg-internal-pilot`.

## Review results (both sites)

- **Accessibility:** 15 of 15 built-in checks. Colour contrast is at least 4.96:1 on
  every text pair. In a real browser, axe-core found no WCAG 2.2 AA violations across
  24 page scans (six pages, desktop and mobile, both sites), including with the mobile
  menu open. A keyboard reaches the skip link first, opens the menu with Enter, and sees
  a focus ring throughout. Reduced motion switches every transition off.
- **Performance:** 6 of 6 checks. First visit about 112–114 KB in total, including
  fonts. No JavaScript, no third-party requests, no images. Layout shift measured at 0.
- **Responsive:** no horizontal overflow on any page at 1440, 820 or 390 pixels.

## Before publication

Each draft's launch-readiness list names everything:

- your design approval;
- the business email and the other missing facts;
- confirming or removing items marked _To confirm_;
- a privacy policy;
- where form messages go;
- hosting;
- configuring the planned address (DNS);
- explicit approval to publish.

None has been done.
