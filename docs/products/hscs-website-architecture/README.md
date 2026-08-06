# HSCS Website Information Architecture

**Herman Supply Chain Solutions — Transportation & Operations Consulting**

**Owner:** Keith Herman, CEO & Product Owner
**Author:** Claude (engineering)
**Status:** Definitive website blueprint — v1.0
**Date:** 2026-08-06
**Governed by:** [HSCS Commercial Foundation v1.0](../hscs-commercial-foundation/README.md) — approved

---

> **What this document is.** The definitive information architecture (IA) for the HSCS
> website: the complete sitemap, navigation, page hierarchy, user journeys, calls-to-action,
> internal-linking strategy, SEO page mapping, and conversion-funnel architecture. It is the
> blueprint every future design and development decision must implement.
>
> **What this document is not.** It is **not** page copy, **not** visual design, and **not**
> code. It defines *what pages exist, how they relate, where users travel, and how the site
> converts* — never how a page looks or reads. Slugs below are IA identifiers, not final copy.
>
> **Governing doctrine (inherited from Foundation v1.0, non-negotiable):**
> **Operations lead. Technology supports. Operational expertise is the product. AI enhances
> analysis, validation, and decision-making.** HSCS is a firm of *operators who consult — not
> consultants who understand operations.* Every IA decision below serves that order: the
> operating record and the outcome lead; AI and tooling appear only as enhancers. The single
> primary conversion across the entire site is **Request an Operations Assessment.**

---

## Table of contents

1. [Complete sitemap](#1-complete-sitemap)
2. [Navigation structure](#2-navigation-structure)
3. [Page hierarchy](#3-page-hierarchy)
4. [User journeys](#4-user-journeys)
5. [Primary calls-to-action per page](#5-primary-calls-to-action-per-page)
6. [Internal linking strategy](#6-internal-linking-strategy)
7. [SEO page mapping](#7-seo-page-mapping)
8. [Conversion funnel architecture](#8-conversion-funnel-architecture)
- [Appendix A — Alignment matrix to Foundation v1.0](#appendix-a--alignment-matrix-to-foundation-v10)
- [Appendix B — Naming, slugs & IA conventions](#appendix-b--naming-slugs--ia-conventions)

---

## 1. Complete sitemap

Every page the launch site requires. Grouped by section. Slugs are stable IA identifiers.
Page-type codes: **L0** home · **L1** section hub · **L2** detail page · **L3** article/spoke ·
**U** utility/system · **G** gated (lead magnet).

```
/                                                          [L0]  Home
│
├── /services/                                             [L1]  Services hub
│   ├── /services/operations-assessment/                   [L2]  S0 · Operations Assessment ★ front door
│   ├── /services/transportation-fleet-optimization/       [L2]  S1
│   ├── /services/warehousing-distribution-improvement/    [L2]  S2
│   ├── /services/final-mile-white-glove-delivery/         [L2]  S3
│   ├── /services/operational-turnaround-margin-recovery/  [L2]  S4
│   ├── /services/operations-technology-advisory/          [L2]  S5
│   ├── /services/operations-transformation-program/       [L2]  S6
│   ├── /services/ai-enablement-for-operations/            [L2]  S7
│   ├── /services/advisory-operations-leadership/          [L2]  S8
│   ├── /services/executive-operations-dashboards/         [L2]  S9
│   └── /services/government-logistics/                    [L2]  Practice area (Foundation §6.5)
│
├── /industries/                                           [L1]  Industries hub
│   ├── /industries/white-glove-high-touch-delivery/       [L2]  Herman Movers proof
│   ├── /industries/direct-to-customer-cold-chain/         [L2]  Arctic Glacier proof
│   ├── /industries/middle-mile-logistics/                 [L2]  Amazon proof
│   ├── /industries/final-mile-retail-delivery/            [L2]  Lowe's / Sears / Bob's proof
│   └── /industries/warehousing-fulfillment/               [L2]  Sorrento / Lactalis proof
│
├── /experience/                                           [L1]  The end-to-end operating lifecycle (credibility engine)
│       (single narrative page; section anchors per lifecycle stage:
│        #manufacturing #warehousing #middle-mile #distribution #final-mile #white-glove)
│
├── /method/                                               [L1]  How we work — methodology + honesty guarantee
│   └── /method/operations-assessment-framework/           [L2]  The assessment framework detail (Foundation §10)
│
├── /insights/                                             [L1]  Content hub (blog root)
│   ├── /insights/transportation-fleet-operations/         [L2]  Pillar page → cluster
│   │      └── /insights/transportation-fleet-operations/<article-slug>/   [L3]  articles (spokes)
│   ├── /insights/warehouse-distribution/                  [L2]  Pillar page → cluster
│   │      └── …/<article-slug>/                            [L3]
│   ├── /insights/final-mile-white-glove/                  [L2]  Pillar page → cluster
│   │      └── …/<article-slug>/                            [L3]
│   ├── /insights/operations-turnaround-margin/            [L2]  Pillar page → cluster
│   │      └── …/<article-slug>/                            [L3]
│   ├── /insights/operations-technology-advisory/          [L2]  Pillar page → cluster
│   │      └── …/<article-slug>/                            [L3]
│   ├── /insights/ai-in-operations/                        [L2]  Pillar page → cluster (enhancement framing)
│   │      └── …/<article-slug>/                            [L3]
│   └── /insights/operations-assessment/                   [L2]  Pillar page → cluster (front-door topic)
│          └── …/<article-slug>/                            [L3]
│
├── /guides/                                               [L1]  Resource / lead-magnet hub
│   ├── /guides/transportation-fleet-operations-guide/     [G]   Gated vertical guide → intake
│   ├── /guides/warehouse-distribution-guide/              [G]   Gated vertical guide → intake
│   ├── /guides/final-mile-white-glove-guide/              [G]   Gated vertical guide → intake
│   ├── /guides/operations-turnaround-guide/               [G]   Gated vertical guide → intake
│   └── /guides/operations-assessment-guide/               [G]   Gated "what an assessment delivers" → intake
│
├── /about/                                                [L1]  The firm + founder (built by a business owner)
│
├── /request-an-assessment/                                [L1]  ★ PRIMARY CONVERSION — assessment intake
├── /contact/                                              [L1]  General contact (secondary conversion)
│
└── Utility / system
    ├── /thank-you/                                        [U]   Post-conversion confirmation (goal page)
    ├── /insights/subscribe/                               [U]   Newsletter opt-in confirmation
    ├── /privacy-policy/                                   [U]
    ├── /terms-of-service/                                 [U]
    ├── /accessibility/                                    [U]
    ├── /sitemap.xml  ·  /robots.txt                       [U]   Machine sitemap + crawl directives
    └── /404                                               [U]   Not-found (routes to search + top sections)
```

**Sitemap notes**

- **One front door.** `/services/operations-assessment/` (S0) is the pivotal offer; the whole
  site funnels toward requesting it via `/request-an-assessment/`.
- **Experience is one narrative page, not six.** The six lifecycle stages are *sections/anchors*
  on `/experience/` (Foundation §8). The **five industry pages** carry the vertical SEO weight so
  the two do not compete for the same queries (see §7 for the deliberate split).
- **Government logistics is a service/practice page, not a separate site or brand** (Foundation
  §6.5, §7.3). It lives under `/services/` because the practice leads and software supports it.
- **No page exists without a job.** Every L1/L2 page maps to a Foundation service, industry,
  lifecycle stage, or funnel role (Appendix A). No orphan pages, no placeholder pages.

---

## 2. Navigation structure

### 2.1 Primary (header) navigation

Seven top-level items. The final item is the persistent primary CTA button, visually distinct.

| Order | Label | Target | Type |
| --- | --- | --- | --- |
| 1 | **Services** | `/services/` | Dropdown / mega-menu |
| 2 | **Industries** | `/industries/` | Dropdown |
| 3 | **Experience** | `/experience/` | Direct link |
| 4 | **Method** | `/method/` | Direct link |
| 5 | **Insights** | `/insights/` | Direct link |
| 6 | **About** | `/about/` | Direct link |
| 7 | **Request an Assessment** | `/request-an-assessment/` | **CTA button (persistent)** |

**Ordering rationale (operator-first):** *Services* and *Industries* lead because the buyer is
looking for "can you solve my problem" and "have you run my kind of operation." *Experience* and
*Method* are the credibility and trust proofs, one click deep. The CTA is always visible.

### 2.2 Services mega-menu (grouped by the Foundation service ladder)

```
SERVICES ▾
┌─ Start here ───────────────────────────────────────────────┐
│  Operations Assessment (S0)   ← highlighted, the front door │
├─ Core engagements ─────────────┬─ Programs & advisory ──────┤
│  Transportation & Fleet (S1)   │  Transformation Program(S6)│
│  Warehousing & Distribution(S2)│  AI-Enablement for Ops (S7)│
│  Final-Mile & White-Glove (S3) │  Advisory Leadership   (S8)│
│  Turnaround & Margin (S4)      │  Executive Dashboards  (S9)│
│  Operations Tech Advisory (S5) │                            │
├─ Practice area ────────────────┴────────────────────────────┤
│  Government Logistics                                        │
└─────────────────────────────────────────────────────────────┘
  Footer of menu: [ Request an Operations Assessment → ]
```

### 2.3 Industries dropdown (lifecycle order)

Listed in supply-chain order to reinforce the end-to-end story (Foundation §8):
Warehousing & Fulfillment → Middle-Mile Logistics → Direct-to-Customer / Cold-Chain →
Final-Mile Retail Delivery → White-Glove & High-Touch Delivery. A trailing link:
**See the full operating lifecycle → `/experience/`.**

### 2.4 Footer navigation (full-site map + trust)

Four columns plus a utility row.

| Column 1 — Services | Column 2 — Industries | Column 3 — Company | Column 4 — Resources |
| --- | --- | --- | --- |
| Operations Assessment | Warehousing & Fulfillment | Experience | Insights |
| Transportation & Fleet | Middle-Mile Logistics | Method | Guides |
| Warehousing & Distribution | Direct-to-Customer / Cold-Chain | About | Assessment framework |
| Final-Mile & White-Glove | Final-Mile Retail Delivery | Contact | Subscribe |
| Turnaround & Margin | White-Glove & High-Touch | Request an Assessment ★ | Government Logistics |
| Ops Technology Advisory | | | |
| Transformation / AI-Enablement / Advisory / Dashboards | | | |

**Utility row:** Privacy Policy · Terms of Service · Accessibility · © HSCS. **Footer CTA band
(site-wide):** "Request an Operations Assessment" → `/request-an-assessment/`.

### 2.5 Utility, mobile & breadcrumb navigation

- **Utility nav (top-right, small):** phone / "Request an Assessment" (collapses to the CTA on scroll).
- **Mobile nav:** hamburger → accordion mirroring §2.1; the CTA button is pinned (sticky) at all
  times so conversion is never more than one tap away.
- **Breadcrumbs:** on every L2/L3 page, reflecting the hierarchy in §3 (e.g.
  `Home › Services › Transportation & Fleet Optimization`; `Home › Insights › Warehouse &
  Distribution › <article>`). Breadcrumbs emit `BreadcrumbList` schema (§7).

---

## 3. Page hierarchy

### 3.1 Depth model (max 3 clicks to any page; 1 click to convert)

```
L0  Home
│
├─ L1  Section hubs:  Services · Industries · Experience · Method · Insights · Guides · About
│                     Conversion hubs: Request-an-Assessment · Contact
│   │
│   ├─ L2  Detail pages:  each service · each industry · method framework · each insight pillar · each guide
│   │       │
│   │       └─ L3  Article spokes:  insight cluster articles only
│   │
│   └─ (Experience is L1 with in-page stage anchors — no L2 children by design)
│
└─ U   Utility/system:  thank-you · subscribe · legal · sitemap.xml · 404   (outside the marketing hierarchy)
```

**Rules:**

1. **Three-click ceiling.** Every marketing page is reachable within three clicks of Home
   (nav → hub → detail; or nav → pillar → article).
2. **One-click convert.** `/request-an-assessment/` is reachable in one click from *every* page
   via the persistent CTA (§2.1, §2.5).
3. **No deeper than L3.** Articles are the deepest marketing nodes. If content wants to go
   deeper, it becomes a new spoke under a pillar, not an L4.
4. **Hubs never dead-end.** Every L1 hub lists and links its L2 children and carries the primary CTA.

### 3.2 Parent → child map

| Parent (L1) | Children (L2) | Grandchildren (L3) |
| --- | --- | --- |
| Services | 10 service pages + Government Logistics practice | — |
| Industries | 5 industry pages | — |
| Experience | *(none — stage anchors in-page)* | — |
| Method | Operations Assessment Framework | — |
| Insights | 7 pillar pages | Cluster articles per pillar |
| Guides | 5 gated guides | — |
| About | *(none)* | — |
| Request-an-Assessment / Contact | *(none — terminal conversion)* | — |

### 3.3 Page template classes (for future design/dev — structure only, not visuals)

- **T-Home** (L0) — positioning + proof strip + service ladder + method + industries + CTA bands.
- **T-Hub** (L1) — section intro + child index + primary CTA (Services, Industries, Insights, Guides).
- **T-Service** (L2) — outcome / method-fit / who-it's-for / related industries / CTA.
- **T-Industry** (L2) — operating proof / lifecycle placement / related services / CTA.
- **T-Narrative** (L1) — Experience & About (long-form credibility, stage anchors).
- **T-Method** (L1/L2) — methodology + assessment framework + honesty guarantee + CTA.
- **T-Pillar** (L2) — topic overview + cluster index + CTA.
- **T-Article** (L3) — long-form article + related links + CTA.
- **T-Guide** (G) — gated asset landing + capture form.
- **T-Convert** (L1) — assessment intake / contact form.
- **T-Utility** (U) — legal, thank-you, 404.

*(Template classes name the structural pattern only. Layout, styling, and copy are downstream.)*

---

## 4. User journeys

Journeys are defined by **persona** (Foundation §5.3) and by **entry channel** (Foundation
§16.1). Every journey resolves to the same destination: **Request an Operations Assessment**.

### 4.1 Persona journeys

**A · Owner-Operator CEO** — *"built by a business owner"*
```
Home → Experience (the 35-yr operating record) → About (trust) →
Services: Operations Assessment → Request an Assessment
```
Emotional arc: recognition ("this person has run a business like mine") → trust → low-risk first step.

**B · COO under margin pressure** — *speed + evidence*
```
Home / Search → Services: Turnaround & Margin (S4) or Operations Assessment (S0) →
Method (evidence-backed, honesty guarantee) → Request an Assessment
```
Emotional arc: relevance → confidence in the method → book.

**C · Transportation / Fleet Director** — *speaks my language*
```
Search → Industries: Middle-Mile or Final-Mile → Services: Transportation & Fleet (S1) →
Experience (#middle-mile / #final-mile anchor) → Request an Assessment
```
Emotional arc: credibility ("ran Amazon middle-mile / retail final-mile") → fit → book.

**D · Warehouse / Distribution / Plant Manager** — *practical, floor-level*
```
Search → Industries: Warehousing & Fulfillment → Services: Warehousing & Distribution (S2) →
Insights: Warehouse & Distribution pillar (proof of practical thinking) → Request an Assessment
```
Emotional arc: "they've run a DC in a real manufacturer" → practicality → book.

### 4.2 Entry-channel journeys

| Channel (Foundation §16.1) | Typical landing page | Path to conversion |
| --- | --- | --- |
| **Organic search — service intent** | A service L2 (e.g. S1) | Service → related Industry → Method → Request an Assessment |
| **Organic search — problem/topic intent** | An Insights pillar or article (L2/L3) | Article → Pillar → mapped Service → Request an Assessment |
| **Organic search — vertical intent** | An Industry L2 | Industry → Experience anchor → mapped Service → Request an Assessment |
| **Founder-led LinkedIn** | Insights article or Experience | Content → Experience/About → Request an Assessment |
| **Lead magnet / guide** | A gated Guide (G) | Guide capture → nurture email → Request an Assessment |
| **Referral / network** | Home or About | About/Experience → Operations Assessment → Request an Assessment |
| **Direct / brand** | Home | Home → Services or Experience → Request an Assessment |

### 4.3 The universal spine

Regardless of entry, every journey is engineered to pass three checkpoints before the ask:

```
  CREDIBILITY  →  FIT  →  METHOD/TRUST  →  ASK
  (Experience/    (Service/  (Method +      (Request an
   Industry)       Industry)  honesty)       Assessment)
```

The site's job is to make sure a visitor can reach all three from wherever they land — which is
what the internal-linking strategy (§6) guarantees.

### 4.4 Micro-journeys (not-ready-to-book)

- **Wants proof first:** any page → Insights → pillar → article → (nurtured) → Assessment.
- **Wants a takeaway:** any page → Guides (gated) → email capture → nurture → Assessment.
- **Wants to stay in touch:** any page → Insights subscribe → nurture → Assessment.

These capture intent short of the primary conversion so no qualified operator leaves untracked
(feeds the funnel, §8).

---

## 5. Primary calls-to-action per page

**Site-wide primary CTA:** **Request an Operations Assessment** → `/request-an-assessment/`.
It appears on **every** marketing page (header button + at least one in-body band + footer band).
Each page also carries a **context-appropriate secondary CTA** that advances a not-yet-ready
visitor without competing with the primary.

| Page | Primary CTA | Secondary CTA |
| --- | --- | --- |
| Home | Request an Operations Assessment | Explore the operating lifecycle (Experience) |
| Services hub | Request an Operations Assessment | Start with an Operations Assessment (S0) |
| S0 · Operations Assessment | Request an Operations Assessment | See the assessment framework (Method) |
| S1 · Transportation & Fleet | Request an Operations Assessment | See middle-mile & final-mile experience (Industries) |
| S2 · Warehousing & Distribution | Request an Operations Assessment | See warehousing experience (Industry) |
| S3 · Final-Mile & White-Glove | Request an Operations Assessment | See final-mile & white-glove experience (Industries) |
| S4 · Turnaround & Margin | Request an Operations Assessment | Read the method (evidence + honesty) |
| S5 · Ops Technology Advisory | Request an Operations Assessment | Read: technology, honestly (Insights) |
| S6 · Transformation Program | Request an Operations Assessment | Start with an Operations Assessment (S0) |
| S7 · AI-Enablement for Ops | Request an Operations Assessment | How AI enhances our analysis (Method) |
| S8 · Advisory Leadership | Request an Operations Assessment | Contact us |
| S9 · Executive Dashboards | Request an Operations Assessment | Start with an Operations Assessment (S0) |
| Government Logistics (practice) | Request an Operations Assessment | Contact us (public-sector intake) |
| Industries hub | Request an Operations Assessment | See the full operating lifecycle (Experience) |
| Each Industry page | Request an Operations Assessment | See the mapped service (S1/S2/S3) |
| Experience | Request an Operations Assessment | Explore our services |
| Method | Request an Operations Assessment | See the assessment framework detail |
| Method · Assessment Framework | Request an Operations Assessment | Request your Operations Assessment |
| Insights hub | Request an Operations Assessment | Subscribe to Insights |
| Insight pillar | Request an Operations Assessment | Download the related guide (G) |
| Insight article | Request an Operations Assessment | Read the pillar / download the guide (G) |
| Guides hub | Download a guide | Request an Operations Assessment |
| Each Guide (gated) | Download the guide (capture) | Request an Operations Assessment |
| About | Request an Operations Assessment | Read the operating record (Experience) |
| Request-an-Assessment | Submit assessment request (form) | — (terminal) |
| Contact | Send message (form) | Request an Operations Assessment |
| Thank-you | Read Insights while we prepare | Subscribe to Insights |

**CTA rules (operator-first, doctrine-aligned):**

1. **No page leads with a tool.** A CTA never says "Try FleetHuddle/DispatchAI/etc." — tooling
   is an engagement enhancer (Foundation §18), never the offer.
2. **One primary, one secondary, per page.** More CTAs dilute; the primary is always the assessment.
3. **The assessment is the low-risk yes.** Secondary CTAs feed visitors *toward* it (guide,
   method, experience), never away from it.

---

## 6. Internal linking strategy

### 6.1 Model — hub-and-spoke, cross-linked by the Foundation map

```
        ┌───────────────┐        ┌────────────────┐
        │  SERVICES (S) │◄──────►│ INDUSTRIES (I)  │
        └──────┬────────┘        └────────┬────────┘
               │  both link into          │
               ▼                          ▼
        ┌──────────────────────────────────────────┐
        │      EXPERIENCE  ·  METHOD  (trust)       │
        └───────────────────┬──────────────────────┘
                            │  every page links to
                            ▼
                 ┌────────────────────────┐
                 │  REQUEST AN ASSESSMENT │  ◄── INSIGHTS pillars/articles
                 └────────────────────────┘        and GUIDES funnel in
```

### 6.2 Linking rules

1. **Pillar ↔ cluster (SEO core).** Every Insights pillar links to all its articles; every
   article links up to its pillar and sideways to 2–4 sibling articles. No article is an orphan.
2. **Service ↔ Industry cross-links (the operator-first bridge).** Each service links to the
   industries that prove it, and each industry links to the services it needs:

   | Service | Links to industries | Industries link back to |
   | --- | --- | --- |
   | S1 Transportation & Fleet | Middle-Mile, Final-Mile | S1 |
   | S2 Warehousing & Distribution | Warehousing & Fulfillment, D2C/Cold-Chain | S2 |
   | S3 Final-Mile & White-Glove | Final-Mile, White-Glove | S3 |
   | S4 Turnaround & Margin | all five (margin is universal) | S4 (as needed) |
   | S5 Ops Technology Advisory | all (via Insights tech pillar) | S5 |

3. **Experience is the credibility hub.** `/experience/` links out to every industry page (via
   the matching lifecycle-stage anchor) and to the services those stages support; industries and
   the About page link back into the relevant Experience anchor.
4. **Method is the trust hub.** `/method/` links to S0 (Operations Assessment) and to the
   assessment-framework detail; every service links to Method once (evidence + honesty guarantee).
5. **Insights → money pages.** Every pillar and article links to (a) its mapped service, and (b)
   the primary CTA. Topic content never dead-ends in content.
6. **Guides ↔ Insights.** Each pillar offers the matching gated guide; each guide links to its
   pillar and to the assessment.
7. **Everything → the assessment.** The primary CTA link to `/request-an-assessment/` is present
   on every marketing page (structurally guaranteed by header + footer, §2).
8. **Breadcrumbs everywhere (L2/L3).** Reinforce hierarchy and distribute link equity upward (§2.5).
9. **No orphans, ever.** A page not linked from at least its hub + one contextual location is an
   IA defect. `/sitemap.xml` lists all indexable pages as a backstop, not a substitute.

### 6.3 Link-equity priorities

Home and the footer pass equity to, in priority order: **(1)** `/services/operations-assessment/`
(front door), **(2)** the five industry pages (credibility + vertical SEO), **(3)** the core
service pages (S1–S5), **(4)** Insights pillars. Deep articles earn equity by clustering under
pillars, not by direct Home links.

---

## 7. SEO page mapping

Each indexable page maps to a Foundation §12 topic cluster, a primary search intent, a funnel
stage (§8), and a structured-data type. **Deliberate split to avoid cannibalization:** the
**Industry** pages own commercial *vertical* intent; the **Insights** pillars own *informational*
topic intent; the **Service** pages own commercial *service* intent; **Experience** targets
*brand/founder/authority* intent (E-E-A-T), not competitive keywords.

| Page | Foundation §12 cluster | Primary intent (theme, not final copy) | Search intent | Funnel stage | Schema |
| --- | --- | --- | --- | --- | --- |
| Home | Brand / entity | "HSCS transportation & operations consulting" | Navigational/brand | Awareness→Action | Organization, WebSite |
| S0 Operations Assessment | Operations assessment | "operations assessment / logistics operations audit" | Commercial | Evaluation | Service, FAQPage |
| S1 Transportation & Fleet | Transportation & fleet ops consulting | "transportation operations / fleet optimization consultant" | Commercial | Consideration | Service |
| S2 Warehousing & Distribution | Warehouse & distribution consulting | "warehouse productivity / distribution network consultant" | Commercial | Consideration | Service |
| S3 Final-Mile & White-Glove | Final-mile & white-glove delivery | "final mile / white glove delivery consulting" | Commercial | Consideration | Service |
| S4 Turnaround & Margin | Operations turnaround & margin | "operations turnaround / logistics margin improvement" | Commercial | Consideration | Service |
| S5 Ops Technology Advisory | Operations technology advisory | "TMS/WMS selection / routing software advisory" | Commercial | Consideration | Service |
| S6 Transformation Program | (spans clusters) | "operations transformation program" | Commercial | Decision | Service |
| S7 AI-Enablement for Ops | AI in operations (enhancement) | "AI for logistics operations / automation ROI" | Commercial | Consideration | Service |
| S8 Advisory Leadership | (brand/service) | "fractional operations leadership / operations advisor" | Commercial | Decision | Service |
| S9 Executive Dashboards | (brand/service) | "operations executive dashboard / visibility" | Commercial | Expansion | Service |
| Government Logistics | (practice area) | "government logistics consulting" | Commercial | Consideration | Service |
| Industry: Warehousing & Fulfillment | Warehouse & distribution | "warehouse operations consulting" + vertical | Commercial/vertical | Consideration | Service, Article |
| Industry: Middle-Mile | Transportation & fleet | "middle mile logistics consulting" | Commercial/vertical | Consideration | Service, Article |
| Industry: D2C / Cold-Chain | Warehouse & distribution | "direct-to-customer / cold chain distribution consulting" | Commercial/vertical | Consideration | Service, Article |
| Industry: Final-Mile Retail | Final-mile & white-glove | "retail final mile / big-and-bulky delivery consulting" | Commercial/vertical | Consideration | Service, Article |
| Industry: White-Glove | Final-mile & white-glove | "white glove delivery operations consulting" | Commercial/vertical | Consideration | Service, Article |
| Experience | Authority / E-E-A-T | founder operating record; entity/expertise signals | Brand/authority | Credibility | Person, AboutPage |
| Method | Operations assessment | "how operations assessment works / evidence-based consulting" | Informational→Commercial | Trust | AboutPage, FAQPage |
| Method · Assessment Framework | Operations assessment | "operations assessment framework / scoring" | Informational | Trust | Article, FAQPage |
| Insights hub | (all clusters) | topic index | Informational | Awareness | Blog |
| Insights pillar × 7 | matching §12 cluster | pillar topic (head term) | Informational | Awareness/Interest | Article |
| Insights article × N | parent cluster | long-tail question/how-to | Informational | Awareness/Interest | Article |
| Guides × 5 | matching cluster | "operations guide / checklist" (gated) | Informational (high-intent) | Interest→Evaluation | Article (noindex gated body; index landing) |
| About | Brand / entity | firm + founder | Brand | Trust | AboutPage, Organization |
| Contact / Request-an-Assessment | Conversion | brand + "request assessment" | Transactional | Action | ContactPage |

**Technical SEO foundations (from Foundation §12.3, IA-level requirements):**

- One primary intent per URL; descriptive slugs matching the hierarchy (Appendix B).
- Canonical tags on every page; industry/experience split prevents self-cannibalization.
- `sitemap.xml` auto-generated from this tree; `robots.txt` permits crawl; gated guide *bodies*
  `noindex`, guide *landing pages* indexable.
- Structured data per the table; `BreadcrumbList` on every L2/L3.
- Internal-link depth ≤ 3 for all indexable pages (crawl efficiency), per §3.1.
- **E-E-A-T is the moat:** author/founder markup ties content to the real 35-year operating
  record — the one signal competitors cannot fabricate (Foundation §12.4).

**Honest-baseline note (Foundation §12.5, §16.4):** current rankings, traffic, and authority are
**unknown pending a live VisibilityAI scan.** This IA defines the *structure* to be measured; it
asserts no traffic numbers. Baselines get established, then TARGETs get set — never invented.

---

## 8. Conversion funnel architecture

### 8.1 The funnel mapped onto the site

The site is the physical implementation of Foundation §15. The **Operations Assessment** is the
hinge; everything routes to it.

```
STAGE            VISITOR GOAL                 PAGES (this IA)                 CONVERSION EVENT
─────            ────────────                 ──────────────                 ────────────────
AWARENESS        "who/what is this"           Home, Insights pillars/        (pageview; scroll;
                                              articles, Industry pages        content engagement)
                                                     │
                                                     ▼
INTEREST         "is this relevant to me"     Industry pages, Service pages, Guide download
                                              Guides (gated), Subscribe       → EMAIL CAPTURE ✓
                                                     │                          Newsletter opt-in ✓
                                                     ▼
EVALUATION       "can I trust the method"     S0 Operations Assessment,      Assessment request
                                              Method + Assessment Framework,  → PRIMARY GOAL ✓✓✓
                                              Experience (proof)               (form submit →
                                                     │                          /thank-you/)
                                                     ▼
DECISION         "let's scope the work"       (offline) roadmap review →     Proposal accepted
                                              proposal; site role: S6/S8 pages (offline)
                                                     │
                                                     ▼
ENGAGEMENT       delivery                      (offline) S1–S7                Engagement won (offline)
                                                     │
                                                     ▼
EXPANSION        ongoing value                 S8 Advisory, S9 Dashboards     Renewal/expansion (offline)
```

### 8.2 The assessment as the hinge (why the whole IA points here)

`/request-an-assessment/` is the site's single most important page (Foundation §15.2). It is:

- **one click from every page** (persistent CTA, §2, §5);
- the **primary conversion goal** (form submit → `/thank-you/`);
- fed by **every** section — services, industries, experience, method, insights, guides;
- the **low-friction, high-value yes** that qualifies, demonstrates the method, and bridges to
  paid engagements.

### 8.3 Conversion & micro-conversion inventory

| Event | Page(s) | Type | Funnel role |
| --- | --- | --- | --- |
| **Assessment request** (form submit) | `/request-an-assessment/` | **Primary macro-conversion** | Evaluation → Decision |
| Contact message | `/contact/` | Secondary macro-conversion | Any → sales |
| Guide download | `/guides/*` (gated) | Micro (email capture) | Interest |
| Newsletter subscribe | `/insights/subscribe/`, pillar/article | Micro (email capture) | Awareness/Interest |
| Method / framework view | `/method/*` | Engagement signal | Evaluation (trust) |
| Experience read (scroll depth) | `/experience/` | Engagement signal | Credibility |
| Service ↔ Industry cross-navigation | S/I pages | Engagement signal | Consideration |

### 8.4 Lead capture & routing (IA-level)

- **Capture points:** assessment intake, contact form, gated guides, newsletter — all feed the CRM.
- **Qualify:** against ICP + trigger events (Foundation §5.2, §16.3) — fit/intent scoring (system, not a page).
- **Route:** qualified operators → founder-led assessment scheduling; early-stage → nurture sequence.
- **Nurture:** guide/subscribe captures enter an email sequence that points back to the assessment
  (content → `/insights/` → `/request-an-assessment/`).
- **Confirmation:** every capture resolves to a `/thank-you/`-class page that keeps the visitor
  engaged (Insights / next step) rather than dead-ending.

### 8.5 Measurement architecture (honest baselines — Foundation §16.4)

- **Goals:** assessment request (primary), contact, guide download, subscribe — configured as
  discrete conversion events on the pages named in §8.3.
- **Funnel visibility:** stage-to-stage conversion (Awareness→Interest→Evaluation→Assessment)
  measured from real events; **baselines are established, not assumed.**
- **No invented numbers.** Until analytics + a live VisibilityAI scan produce real data, funnel
  metrics read as **to be established** (consistent with the platform honesty rules and Foundation
  §15.3/§16.4). The IA defines *what* to measure and *where*; it fabricates no results.
- **Pipeline starts at zero — this is a launch.** The architecture is built to *measure* the
  climb, not to report a climb that hasn't happened.

---

## Appendix A — Alignment matrix to Foundation v1.0

Every major IA element traces to the approved foundation. If the foundation changes, the mapped
IA element is revisited here.

| Foundation v1.0 element | IA realization |
| --- | --- |
| §3.3 Doctrine (Operations lead; AI enhances) | CTA rules (§5), no tool-led pages, nav ordering (§2.1) |
| §5 Target customer profiles | Persona journeys (§4.1) |
| §6 Service catalog (S0–S9) | `/services/*` pages (§1), Services mega-menu (§2.2) |
| §6.5 Government logistics practice area | `/services/government-logistics/` (not a separate site) |
| §7 Industry verticals (Tier-1 ×5) | `/industries/*` pages (§1), Industries dropdown (§2.3) |
| §8 End-to-end operating lifecycle | `/experience/` narrative with 6 stage anchors (§1, §3) |
| §9–§10 Methodology + assessment framework | `/method/` + `/method/operations-assessment-framework/` |
| §11 Website IA (top-level nav, home hierarchy) | Expanded into full sitemap/nav/hierarchy (§1–§3) |
| §12 SEO strategy (clusters, E-E-A-T) | SEO page mapping (§7) |
| §13 Content marketing (pillars) | `/insights/*` pillars + clusters (§1, §6) |
| §15 Sales funnel (assessment hinge) | Conversion funnel architecture (§8) |
| §16 Lead generation (capture, channels) | Guides, capture inventory, entry-channel journeys (§4.2, §8.4) |
| §18 Operational Toolbox (tools ≠ products) | No tool has a "product" page or a buy CTA (§5 rule 1) |
| Honesty rules (no invented data) | Honest-baseline notes (§7, §8.5) |

---

## Appendix B — Naming, slugs & IA conventions

- **Slugs are lowercase, hyphenated, descriptive, and stable** (e.g.
  `transportation-fleet-optimization`). They are IA identifiers; final on-page wording is
  downstream copy and may differ from the slug.
- **Trailing slash** on all directory-style URLs; one canonical form per page.
- **Service slugs** describe the outcome, not an internal code (the "S1/S0" codes are for this
  blueprint and the foundation, never in the URL).
- **Industry slugs** name the vertical, in the buyer's language.
- **Insights** uses `/insights/<cluster>/<article>/`; **Guides** uses `/guides/<topic>-guide/`.
- **No tool names as top-level pages.** FleetHuddle, DispatchAI, TransportationAI, Executive
  Dashboards, Government Logistics, AI-supported Operational Intelligence appear only *within*
  service/method/toolbox context, never as standalone product URLs (Foundation §18).
- **Additions go through this document first.** A new page is added to the sitemap (§1),
  hierarchy (§3), CTA table (§5), linking rules (§6), and SEO map (§7) here — before it is
  designed or built. This keeps the site aligned with the foundation by construction.

---

> **Operations lead. Technology supports. Operational expertise is the product. AI enhances
> analysis, validation, and decision-making.**

*This is the definitive website blueprint. Visual design and development build on it; they do
not redefine it. Revise the architecture here — not by drift in the pages it governs.*

*Version 1.0 — complete and ready for approval.*
