# HSCS Design System

**Herman Supply Chain Solutions — Transportation & Operations Consulting**

**Owner:** Keith Herman, CEO & Product Owner
**Author:** Claude (engineering)
**Status:** Definitive visual & UX standard — v1.0
**Date:** 2026-08-06
**Governed by / reflects:**
- [HSCS Commercial Foundation v1.0](../hscs-commercial-foundation/README.md) — approved
- [Website IA v1.0](../hscs-website-architecture/README.md) · [Homepage Architecture v1.0](../hscs-homepage-architecture/README.md) · [Homepage Copy v1.0](../hscs-homepage-architecture/01-homepage-copy.md) · [Page Specifications v1.0](../hscs-website-architecture/01-page-specifications.md)

---

> **What this is.** The governing visual and UX standard that every future HSCS surface — website
> pages, marketing assets, proposals, videos, and software interfaces — inherits. It defines
> principles, brand personality, and the token-level standards (type, color, spacing, grid) plus
> component and governance rules.
>
> **What this is not.** It is **not** page designs, **not** mockups, and **not** code. It specifies
> the *standards* design and development must implement — token **values** are given (that is the
> standard), but no page is laid out and no code is written here. Values are expressed as tables,
> not stylesheets.
>
> **The brand this system must express (Foundation v1.0):**
> Transportation & Operations Consulting · *35 Years of Operational Experience. Enhanced by AI.* ·
> *Built by a Business Owner. Designed for Operators.*
>
> **Doctrine the visual language must obey:** **Operations lead. Technology supports. Operational
> expertise is the product. AI enhances analysis, validation, and decision-making.** The system is
> deliberately **professional, executive, operational, industrial, modern, and trustworthy** — and
> deliberately **avoids startup aesthetics and gratuitous "AI" styling** (no neon gradients, no
> glowing orbs, no sci-fi UI). Technology supports the brand; operational expertise leads it.

---

## Table of contents

1. [Design principles](#1-design-principles)
2. [Brand personality](#2-brand-personality)
3. [Typography system](#3-typography-system)
4. [Color system](#4-color-system)
5. [Spacing system](#5-spacing-system)
6. [Grid system](#6-grid-system)
7. [Button standards](#7-button-standards)
8. [Form standards](#8-form-standards)
9. [Card components](#9-card-components)
10. [Navigation standards](#10-navigation-standards)
11. [CTA standards](#11-cta-standards)
12. [Iconography guidance](#12-iconography-guidance)
13. [Imagery guidance](#13-imagery-guidance)
14. [Accessibility standards](#14-accessibility-standards)
15. [Responsive behavior](#15-responsive-behavior)
16. [Component inventory](#16-component-inventory)
17. [Design governance rules](#17-design-governance-rules)
- [Appendix A — Alignment matrix](#appendix-a--alignment-matrix)

---

## 1. Design principles

Seven principles govern every design decision. When a choice is unclear, the earlier principle wins.

1. **Operations lead; technology supports.** The visual weight goes to the operator, the operating
   record, and the outcome — never to the technology. AI and tooling are shown in a supporting
   register (secondary color, smaller scale, never the hero of a layout).
2. **Restraint signals confidence.** An operator who has done the work does not shout. Generous
   whitespace, few typefaces, a tight palette, and squared, engineered forms read as competence.
   Ornament is suspect.
3. **Structure like a well-run operation.** Strong grid, clear hierarchy, predictable rhythm.
   The layout itself should feel *operationally sound* — organized, legible, dependable.
4. **Evidence over decoration.** Data, proof, and specifics are design features. Numbers, labels,
   and evidence get their own treatment (mono type, keylines) rather than being buried.
5. **Operator-legible.** Designed for people who read between shifts on real devices. High contrast,
   large tap targets, plain layouts, fast pages. Legibility beats cleverness every time.
6. **Honest by default.** No fabricated metrics, fake dashboards, or invented proof in any asset.
   Empty states explain themselves. A UI never implies a capability that isn't there (mirrors the
   platform rule: *never leave a control that controls nothing*).
7. **Industrial, not startup.** Sturdy, engineered, grounded — steel, ink, signage. Never neon
   gradients, glassmorphism, glowing "AI" motifs, or playful mascotry.

---

## 2. Brand personality

Six brand adjectives, each translated into concrete design direction. This is the bridge from
Foundation positioning to visual decisions.

| Adjective | Feels like | Design translation |
| --- | --- | --- |
| **Professional** | A firm you'd put in front of your board | Disciplined grid, one display + one text + one mono typeface, tight palette, no clutter |
| **Executive** | Boardroom credibility | Deep navy + ink, serif-free authority, generous margins, confident large headings |
| **Operational** | A well-run dock/DC | Mono data labels, keylines, status/step patterns, structured tables, legible density |
| **Industrial** | Steel, freight, signage | Squared corners (2–6px radius), strong borders over soft shadows, hi-vis amber signal accent |
| **Modern** | Current, not dated or trendy | Grotesque display type, flat surfaces, restrained motion, crisp spacing |
| **Trustworthy** | Says only what's true | High contrast, honest empty states, evidence-forward, no dark patterns, accessible by default |

**Personality guardrails (what HSCS is NOT):** not a tech startup, not a SaaS dashboard brand, not
"AI-first," not playful, not luxury-consumer. When a design decision drifts toward any of those,
it is off-brand. The maps to the copy voice (Foundation §4.3): plain-spoken, confident, specific,
honest — expressed visually.

---

## 3. Typography system

**Type families** (all open-source / SIL OFL — no licensing barrier; secure webfont hosting before launch):

| Role | Typeface | Fallback stack | Why |
| --- | --- | --- | --- |
| **Display / Headings** | **Archivo** (grotesque) | "Neue Haas Grotesk", Inter, Arial, sans-serif | Sturdy, engineered, modern-industrial without novelty |
| **Body / UI** | **Inter** | system-ui, "Segoe UI", Roboto, Arial, sans-serif | Highly legible at all sizes; neutral, professional |
| **Data / Labels / Eyebrows** | **IBM Plex Mono** | ui-monospace, "SFMono-Regular", Menlo, monospace | Signals "operational / engineered / evidence"; used for metrics, labels, overlines |

*[Alternate single-family option if consolidation is preferred: IBM Plex Sans + IBM Plex Mono
throughout. Decision belongs to Keith/brand; default recommendation is the three-role system above.]*

**Type scale** (base 16px = 1rem; ratio ≈1.2–1.25; sizes in px/rem):

| Token | Size | Weight | Line-height | Letter-spacing | Use |
| --- | --- | --- | --- | --- | --- |
| `display-xl` | 56 / 3.5rem | 700 | 1.05 | −0.02em | Hero H1 (desktop) |
| `display-l` | 44 / 2.75rem | 700 | 1.08 | −0.02em | Major section openers |
| `h1` | 36 / 2.25rem | 700 | 1.12 | −0.01em | Page titles |
| `h2` | 28 / 1.75rem | 600 | 1.2 | −0.01em | Section headings |
| `h3` | 22 / 1.375rem | 600 | 1.3 | 0 | Sub-sections |
| `h4` | 18 / 1.125rem | 600 | 1.4 | 0 | Card titles, labels |
| `body-l` | 18 / 1.125rem | 400 | 1.6 | 0 | Lead paragraphs |
| `body` | 16 / 1rem | 400 | 1.6 | 0 | Default body |
| `body-s` | 14 / 0.875rem | 400 | 1.55 | 0 | Secondary text, captions |
| `label` | 13 / 0.8125rem | 500 (mono) | 1.4 | +0.08em, UPPERCASE | Data labels, metadata |
| `eyebrow` | 12 / 0.75rem | 500 (mono) | 1.3 | +0.12em, UPPERCASE | Section eyebrows (e.g., "TRANSPORTATION & OPERATIONS CONSULTING") |

**Rules:** one display face, one text face, one mono — never introduce a fourth. Headings 600–700
only. Body max line length ~70ch. Mono is reserved for labels, eyebrows, and numeric data (the
"evidence" texture) — never for paragraphs. Fluid down-scaling for `display-*` on mobile (§15).

---

## 4. Color system

Palette is deliberately narrow: **deep navy authority + ink + steel neutrals + one hi-vis amber
signal.** No gradients, no purples, no neon. Amber is the operational "signal" color (freight/
signage) used sparingly for the single most important action.

**Core / brand**

| Token | Hex | Use |
| --- | --- | --- |
| `ink` | `#12181F` | Primary text; near-black, cool |
| `navy` | `#13293D` | Primary brand; headers, primary surfaces, executive authority |
| `navy-deep` | `#0D1E2E` | Navy hover/pressed; footer |
| `steel` | `#34506B` | Secondary brand; accents, secondary buttons |
| `slate` | `#55677A` | Muted/secondary text |
| `graphite` | `#2A333D` | Strong borders, industrial dividers |

**Neutrals**

| Token | Hex | Use |
| --- | --- | --- |
| `surface` | `#FFFFFF` | Cards, primary surfaces |
| `paper` | `#F6F7F9` | Page background |
| `mist` | `#ECEFF3` | Subtle section backgrounds, wells |
| `line` | `#D3D9E0` | Default borders/dividers |
| `line-strong` | `#B7C0CA` | Emphasized borders |

**Signal accent (operational) — use sparingly**

| Token | Hex | Use |
| --- | --- | --- |
| `signal` | `#C8621A` | Primary CTA fill; the single highest-emphasis action; key indicators |
| `signal-deep` | `#A94F12` | Signal hover/pressed |
| `signal-wash` | `#F6E9DD` | Rare tinted background behind a signal element |

**Semantic (muted, professional)**

| Token | Hex | Use |
| --- | --- | --- |
| `success` | `#2E7D5B` | Positive/verified states |
| `warning` | `#C88A1A` | Caution |
| `error` | `#B3261E` | Errors, destructive |
| `info` | `#2B5B84` | Informational |

**Contrast pairings & compliance** (target WCAG 2.1 AA; **verify exact ratios in build before ship**):

| Foreground / Background | Intended use | Target |
| --- | --- | --- |
| `ink` on `paper`/`surface` | Body text | AAA (≈14:1) |
| `navy` on `surface` | Headings | AAA |
| `slate` on `surface` | Secondary text | AA (≥4.5:1) — verify |
| `white` on `navy` | Nav, primary-navy buttons | AAA |
| **`ink` on `signal`** | **Primary CTA label (hi-vis signage look)** | AA — verify ≥4.5:1; this pairing is chosen for safe contrast |
| `white` on `signal` | Avoid unless verified | Often <4.5:1 — do **not** use without measurement |

**Rules:** amber `signal` appears on **one** primary action per view (the assessment CTA) — never
as a broad background or on multiple competing elements. Navy/steel carry brand; neutrals carry
structure. Semantic colors are muted, never candy. **No gradients** except, if ever, an
imperceptible navy tonal shift on large surfaces — never a colorful gradient. Provide a dark-mode
mapping later only if a product surface needs it (out of scope for v1.0; note, don't build).

---

## 5. Spacing system

Base unit **4px**. All spacing, padding, and layout gaps use the scale — no arbitrary values.

| Token | px | Typical use |
| --- | --- | --- |
| `space-1` | 4 | Icon-to-label, tight inline |
| `space-2` | 8 | Compact padding, chip padding |
| `space-3` | 12 | Input padding, small gaps |
| `space-4` | 16 | Default element gap, button padding-x |
| `space-5` | 24 | Card padding, grid gutter |
| `space-6` | 32 | Component spacing |
| `space-7` | 40 | Small section rhythm |
| `space-8` | 48 | Sub-section spacing |
| `space-9` | 64 | Section padding (mobile) |
| `space-10` | 80 | Section padding |
| `space-11` | 96 | Section padding (desktop default) |
| `space-12` | 128 | Major section separation (desktop) |

**Vertical rhythm:** section padding is `space-11`/`space-12` (96–128px) on desktop, `space-9`
(56–64px) on mobile. Card internal padding `space-5` (24px). **Radii:** `radius-sm` 2px (inputs,
tags), `radius-md` 4px (buttons), `radius-lg` 6px (cards) — small and engineered; **no pill
buttons, no large rounded "app" cards.** **Elevation (border-first):** prefer 1px `line` borders;
shadows are subtle and rare — `e1` = 0 1px 2px rgba(ink,6%), `e2` = 0 4px 12px rgba(ink,8%) for
overlays/menus only. Industrial surfaces are flat and bordered, not floaty.

---

## 6. Grid system

- **Columns:** 12-column fluid grid.
- **Max content width:** `1200px` (text/content); `1320px` max for full-bleed feature rows.
- **Gutters:** 24px desktop, 16px mobile.
- **Outer margins:** 48px desktop, 24px tablet, 16px mobile (min).
- **Breakpoints:** `xs` <480 · `sm` 480 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536.
- **Column behavior:** 12 → typically 4/8 or 6/6 splits on desktop; collapse to 1 column below `md`.
- **Section anatomy:**

```
| outer margin |  [ 12-col content grid, max 1200px, 24px gutters ]  | outer margin |
|              |  eyebrow (mono)                                     |              |
|              |  H2 heading                                         |              |
|              |  body / component grid                              |              |
|              |  CTA band                                           |              |
```

**Rules:** content never exceeds max width; full-bleed backgrounds are allowed but their content
stays within the grid. Vertical rhythm follows §5. The grid is strict — alignment is a brand
signal (Principle 3).

---

## 7. Button standards

**Variants**

| Variant | Fill | Text | Border | Use |
| --- | --- | --- | --- | --- |
| **Primary** | `signal` (amber) | `ink` | none | The single primary action (assessment CTA) |
| **Secondary** | `navy` | `white` | none | Important non-primary actions |
| **Tertiary / Outline** | transparent | `navy` | 1px `navy` | Lower-emphasis actions |
| **Ghost / Text** | transparent | `steel` | none | Inline/low-emphasis (e.g., "See all services") |
| **Destructive** | transparent | `error` | 1px `error` | Rare; software UI only |

**Sizes** (height / padding-x / text):

| Size | Height | Padding-x | Text |
| --- | --- | --- | --- |
| `lg` | 52px | 24px | `body-l` 600 | Hero/section CTAs |
| `md` | 44px | 20px | `body` 600 | Default (meets 44px min tap target) |
| `sm` | 36px | 16px | `body-s` 600 | Dense UI / inline |

**States (all variants):** default · hover (`signal`→`signal-deep`, `navy`→`navy-deep`, outline
gains subtle fill) · active/pressed (slightly darker) · focus (visible 2px focus ring, offset 2px,
high-contrast — never remove) · disabled (reduced opacity, no pointer) · loading (spinner, label
retained, non-interactive).

**Rules:** radius `radius-md` (4px), never pill. One **Primary** (amber) button per view. Label is a
verb phrase, sentence case, no ALL-CAPS on buttons (caps reserved for mono eyebrows/labels). Icons
optional, 20px, left or right with `space-2` gap. Minimum target 44×44px including padding.

---

## 8. Form standards

**Anatomy (top-to-bottom):** label → (optional helper) → input → (validation message). Labels are
always visible (never placeholder-only). Placeholder is an example, not a label.

| Element | Standard |
| --- | --- |
| **Label** | `label`/`body-s` 500, `ink`, above the field, `space-2` below |
| **Input** | height 48px, padding `space-3` (12px), 1px `line` border, `radius-sm` (2px), `surface` bg, `ink` text |
| **Focus** | 2px `steel` ring/border, visible; never suppressed |
| **Helper text** | `body-s`, `slate`, `space-2` above field-bottom |
| **Error** | 1px `error` border, `error` message below with icon, `body-s`; message is specific and actionable |
| **Success/verified** | optional `success` indicator for validated fields |
| **Disabled/readonly** | `mist` bg, `slate` text, clearly non-interactive |
| **Required** | marked in the label ("required"), not by color alone |

**Field spacing:** `space-5` (24px) between fields; `space-6` before the submit button.
**Groups/fieldsets:** labelled; related fields grouped with a legend.

**The Operations Assessment intake form (the primary conversion form — Page Spec §4.9):** minimal
fields (only what qualifies and enables contact), single clear **Primary** submit ("Request an
Operations Assessment"), reassurance microcopy ("a conversation, not a commitment"), privacy note,
and an explicit "what happens next." No spammy multi-step unless justified; low friction is the goal.

**Accessibility:** every input has a programmatic label; errors announced (aria-live); tab order
logical; touch targets ≥44px; never rely on color alone for state (§14).

---

## 9. Card components

Cards are **flat, bordered, squared** (industrial), not floating rounded app-cards.

**Base card:** `surface` bg, 1px `line` border, `radius-lg` (6px), padding `space-5` (24px),
optional `e1` on hover only. Anatomy: (optional eyebrow/label) → title (`h4`) → body (`body-s`) →
(optional link/CTA).

**Card types:**

| Card | Purpose | Distinct elements |
| --- | --- | --- |
| **Service card** | Services hub / home ladder | Service name, one-line outcome, "start here" flag on Operations Assessment |
| **Industry card** | Industries hub / home | Vertical name, operating-proof line, links to industry page |
| **Insight card** | Insights hub / related | Title, mono date/author label, pillar tag |
| **Guide card** | Guides hub | Guide title, "what's inside" one-liner, download action (micro-CTA) |
| **Stat / evidence card** | Proof, method, assessment preview | Mono figure + label; **only real, sourced numbers — never invented** |
| **Toolbox card** | Home S8 / method | Tool name + engagement role + visible "supports consulting" tag; **no product CTA** |
| **Lifecycle stage card** | Home S3 / Experience | Stage name (mono step index) + operating lesson; order preserved |

**Rules:** consistent padding and border across a set; hover elevation subtle; a card is fully
clickable only if it has one clear destination. **Stat cards may never display a fabricated metric**
(Principle 6). **Toolbox cards never carry buy/try actions** (Foundation §18).

---

## 10. Navigation standards

**Header (desktop):** sticky, `surface`/`navy` bg, brand mark + "Transportation & Operations
Consulting" descriptor, primary nav (Services · Industries · Experience · Method · Insights ·
About), persistent **Primary (amber) "Request an Operations Assessment"** button at right.
Active-item indicator = 2px `signal` underline. Services opens a **mega-menu** grouped by the
service ladder (Page Spec / IA §2.2); Industries a simple dropdown in lifecycle order.

**Header (mobile):** brand + hamburger; **the amber CTA button stays pinned/sticky** at all times
(never buried in the menu). Menu is a full-height accordion mirroring desktop order.

**Footer:** `navy-deep` bg, four-column sitemap (IA §2.4), footer **CTA band** ("Ready when you
are" + amber button), approved boilerplate, utility/legal row. High-contrast text on navy.

**Breadcrumbs:** on every L2/L3 page, `body-s` `slate` with `ink` current item; emits
`BreadcrumbList` schema.

**Rules:** one persistent primary CTA in the header at every breakpoint. Nav labels are the IA
labels, unchanged. No mega-menu promotes a tool as a product. Focus and keyboard navigation fully
supported (§14).

---

## 11. CTA standards

The CTA system is where the doctrine is most visible. It inherits IA §5 and Homepage Architecture §4.

- **One primary per view.** Exactly one **Primary (amber)** button — always *Request an Operations
  Assessment* — per viewport/section. Secondary actions use navy/outline/ghost, never amber.
- **Amber = the assessment, and only the assessment.** The signal color is reserved for the single
  primary conversion. It never marks a tool, a download, or a nav item.
- **Placement:** header (persistent) + at least one in-body CTA band + footer band on every
  marketing page (IA §3.1 one-click-convert). Hero primary CTA within the first mobile viewport.
- **Secondary CTAs feed the primary** (proof, method, industry, guide) — never divert from it.
- **No tool CTA, ever.** FleetHuddle, DispatchAI, TransportationAI, Executive Dashboards, and
  Government Logistics never get "try/buy/learn more" buttons (Foundation §18).
- **Label style:** verb-first, sentence case, specific ("Request an Operations Assessment,"
  "Download the guide"). No vague "Submit," no ALL-CAPS.
- **CTA bands:** full-width, `navy` or `mist` background, single amber primary + optional supporting
  microcopy ("The first step is a conversation, not a commitment.").

---

## 12. Iconography guidance

- **Style:** line icons, geometric, consistent **1.75px stroke**, 24px grid, squared/technical
  terminals (not rounded-cute). Two-tone only when it aids clarity; default single-stroke `ink`/
  `steel`. An industrial/technical drafting feel, not a playful set.
- **Subject matter:** operational and logistical — trucks, trailers, routes/nodes, warehouse racks,
  pallets, docks, dashboards/gauges, checklists, maps. Icons should look like they belong on
  operations signage, not a consumer app.
- **AI restraint:** **no "sparkle," glowing-brain, robot, or magic-wand icons.** Where AI is
  referenced, use a restrained, technical mark (e.g., a node/analysis motif) in the *supporting*
  register — small, `steel`, never the focal point.
- **Usage:** icons support labels, they don't replace them; decorative icons get `aria-hidden`;
  meaningful icons get accessible labels. Consistent size within a set. Never use an icon to imply a
  capability that doesn't exist (Principle 6).

---

## 13. Imagery guidance

- **Subject:** **real operations** — distribution centers, fleets, loading docks, warehouses,
  middle-mile yards, final-mile delivery, the operator on site. Documentary/editorial tone. The
  founder and real operating environments are the hero imagery (credibility engine, Foundation §8).
- **Treatment:** natural, grounded, high-contrast; optional restrained navy duotone/overlay for
  cohesion and text legibility. No heavy filters, no futuristic glows.
- **Avoid (off-brand):** generic stock handshakes, glowing "AI brains," sci-fi HUDs, abstract
  network-orb art, smiling-in-headset call-center clichés, luxury-lifestyle imagery.
- **Honesty (mandatory):** **no fabricated dashboards, fake screens, or invented metrics** in any
  image. Any UI shown must reflect real capability. Any real client site/vehicle/brand imagery must
  be **truthful and permission-cleared before publication** (mirrors the operating-record rule and
  platform honesty rules). When real photography isn't available, use honest, generic operational
  imagery — never a staged "result."
- **Alt text:** every meaningful image has descriptive alt text (§14).

---

## 14. Accessibility standards

Target: **WCAG 2.1 AA** across all HSCS surfaces (a trust requirement, not an add-on).

- **Contrast:** text ≥4.5:1 (≥3:1 large/bold); UI components/focus ≥3:1. The palette (§4) is
  designed to meet this; **exact ratios must be verified in build** (the amber/label pairing
  especially).
- **Focus visibility:** a clear, high-contrast focus indicator on every interactive element; never
  removed. Logical tab order; skip-to-content link.
- **Targets:** interactive targets ≥44×44px (§7, §8).
- **Semantics:** proper landmarks/headings; forms fully labelled; state changes announced
  (`aria-live`); icons labelled or hidden appropriately.
- **Color independence:** never convey state/meaning by color alone (pair with text/icon).
- **Motion:** respect `prefers-reduced-motion`; motion is subtle and optional (§15). No essential
  content behind animation.
- **Media:** captions/transcripts for video (ties to Foundation §14); descriptive alt text for images.
- **Testing:** accessibility is a release gate (§17), not a nice-to-have.

---

## 15. Responsive behavior

Mobile-first, content-priority (inherits Homepage Architecture §5).

- **Breakpoints:** per §6 (`xs`→`2xl`).
- **Type:** `display-*` and `h1` scale down fluidly on small screens; body stays ≥16px (never
  smaller on mobile — legibility).
- **Layout:** multi-column grids collapse to single column below `md`; card grids reflow
  1→2→3/4 columns as width grows; max content width caps on large screens (no edge-to-edge text).
- **Content order is invariant:** the narrative/section order never changes across breakpoints;
  only density and columns change (Homepage Architecture §5).
- **Persistent CTA:** the amber primary CTA is one tap from any scroll position on mobile (sticky
  header button); hero primary CTA sits within the first mobile viewport.
- **Touch:** ≥44px targets; adequate spacing to avoid mis-taps; hover-only affordances have
  tap/focus equivalents.
- **Performance as UX:** fast LCP on mobile; defer/lazy-load below-the-fold media; the first screens
  (hero + credibility) render fast (SEO/E-E-A-T + bounce, Foundation §12.3).
- **Motion:** durations 150/250/400ms, standard easing; restrained transitions only; disabled under
  reduced-motion.

---

## 16. Component inventory

The catalog every HSCS surface draws from. **Status is honest: all are _specified here, not yet
built_** — no HSCS front-end code exists in this repository, and this document does not create any
(Principle 6; no invented "done"). Build status is tracked when implementation begins.

| # | Component | Purpose | Key variants | Status |
| --- | --- | --- | --- | --- |
| 1 | Button | Actions | primary/secondary/outline/ghost/destructive · lg/md/sm | Spec only |
| 2 | Link / Text-CTA | Inline navigation | default/hover/visited | Spec only |
| 3 | Input / Textarea | Data entry | default/focus/error/disabled | Spec only |
| 4 | Select / Checkbox / Radio | Structured input | states as §8 | Spec only |
| 5 | Form / Fieldset | Grouped input | assessment intake, contact | Spec only |
| 6 | Header / Nav bar | Global nav | desktop mega-menu / mobile sticky | Spec only |
| 7 | Mega-menu / Dropdown | Section nav | services / industries | Spec only |
| 8 | Footer | Global footer + CTA band | 4-column | Spec only |
| 9 | Breadcrumbs | Wayfinding | L2/L3 | Spec only |
| 10 | Card (base) | Container | see §9 types | Spec only |
| 11 | Service / Industry / Insight / Guide card | Content | per §9 | Spec only |
| 12 | Stat / Evidence card | Real proof | real numbers only | Spec only |
| 13 | Toolbox card | Tools-as-enhancers | no product CTA | Spec only |
| 14 | Lifecycle stage card | Chain narrative | ordered | Spec only |
| 15 | CTA band | Conversion | navy / mist | Spec only |
| 16 | Section wrapper | Layout rhythm | eyebrow+heading+body+CTA | Spec only |
| 17 | Eyebrow / Label (mono) | Metadata/evidence texture | uppercase mono | Spec only |
| 18 | Tag / Chip | Categorization | pillar tags, "supports consulting" | Spec only |
| 19 | Table | Structured data | operational data | Spec only |
| 20 | Accordion | Mobile nav / FAQ | expand/collapse | Spec only |
| 21 | Icon | Support labels | 24px line set | Spec only |
| 22 | Media / Image frame | Operations imagery | duotone option | Spec only |
| 23 | Toast / Inline alert | Feedback (software UI) | success/warning/error/info | Spec only |
| 24 | Empty state | Honest "no data yet" | explains why (Principle 6) | Spec only |

*[Notably included: an **Empty state** component. Per the honesty doctrine, an empty panel that
explains itself is a first-class component — not an afterthought.]*

---

## 17. Design governance rules

1. **This document is the single source of truth** for HSCS visual/UX standards. Tokens (type,
   color, spacing, grid) are defined here; implementations reference these values, they do not
   invent new ones. New tokens are added here first.
2. **Doctrine gate.** Every design must pass: *operations lead, technology supports?* No design may
   headline AI, present a tool as a product, or give a tool a CTA (Foundation §18). Amber is the
   assessment CTA only.
3. **Anti-startup / anti-AI-cliché gate.** No neon gradients, glassmorphism, glowing orbs, sparkle/
   robot motifs, or sci-fi UI. Industrial, executive, restrained (Principle 7).
4. **Honesty gate.** No component or asset may show a fabricated metric, fake dashboard, or invented
   proof. Empty states explain themselves. Real client/brand imagery is permission-cleared before
   publication. (Platform CLAUDE.md; Foundation §4.5.)
5. **Accessibility gate.** WCAG 2.1 AA is a release requirement: contrast verified, focus visible,
   targets ≥44px, semantics correct. A component failing this is not shippable.
6. **Consistency over novelty.** Reuse existing tokens/components before creating new ones. A new
   component is justified in writing (purpose, variants, states) and added to §16 before use.
7. **One system, all surfaces.** Website, marketing assets, proposals, video, and software UI
   inherit this system. Divergence requires an explicit, documented exception here.
8. **Naming conventions.** Tokens use role-based names (`navy`, `space-5`, `signal`) — never
   value-based (`blue-2`, `orange`). Components use the §16 names.
9. **Change process.** Changes to principles, personality, or tokens are made in this document,
   versioned, and communicated — never by drift in a page or asset. The governed artifacts follow
   the system; the system is not reverse-engineered from them.
10. **Review.** New pages/assets are checked against principles (§1), personality (§2), the gates
    (rules 2–5), and the component inventory (§16) before ship.

---

## Appendix A — Alignment matrix

| Design-system element | Source of truth |
| --- | --- |
| Principles & personality (§1–§2) | Foundation §1–§4 (positioning, doctrine, voice) |
| "Operations lead; tech supports" visual weighting | Foundation §3.3, §18 |
| Amber = assessment CTA only (§4, §11) | IA §5; Homepage Architecture §4; Foundation §15 |
| Typography/data-mono "evidence" texture (§3) | Foundation §10 (evidence), §4.2 (pillars) |
| Card set incl. toolbox & lifecycle (§9) | Homepage Architecture S3/S8; Foundation §8/§18 |
| Nav standards (§10) | IA §2; Page Spec §2 (G1) |
| Accessibility (§14) | Page Spec G7; Foundation trust/values |
| Responsive content-priority (§15) | Homepage Architecture §5; IA §3.1 |
| Honesty gates & empty state (§6, §9, §16, §17) | Platform CLAUDE.md; Foundation §4.5, §10.5 |
| Imagery honesty & permission (§13) | Foundation §8, §14; homepage governance |

---

> **Operations lead. Technology supports. Operational expertise is the product. AI enhances
> analysis, validation, and decision-making.**

*This is the governing visual & UX standard. Every future page, asset, and interface inherits it;
none redefines it. Revise the system here — not by drift in the surfaces it governs.*

*Version 1.0 — complete and ready for approval.*
