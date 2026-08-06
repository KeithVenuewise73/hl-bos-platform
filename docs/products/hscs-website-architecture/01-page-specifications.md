# HSCS Website Page Specifications

**Herman Supply Chain Solutions — Transportation & Operations Consulting**

**Owner:** Keith Herman, CEO & Product Owner
**Author:** Claude (engineering)
**Status:** Definitive implementation specification — v1.0
**Date:** 2026-08-06
**Implements / governed by:**

- [HSCS Website Information Architecture v1.0](./README.md) — approved (sitemap §1)
- [HSCS Commercial Foundation v1.0](../hscs-commercial-foundation/README.md) — approved
- [HSCS Homepage Content Architecture v1.0](../hscs-homepage-architecture/README.md) — approved
- [HSCS Homepage Copy v1.0](../hscs-homepage-architecture/01-homepage-copy.md) — approved

---

> **What this is.** An implementation specification for every page in the approved IA sitemap.
> For each page it defines the ten required fields: **(1) Purpose · (2) Target audience ·
> (3) Business objective · (4) SEO objective · (5) Required sections · (6) Primary CTA ·
> (7) Secondary CTA · (8) Trust & credibility requirements · (9) Internal linking requirements ·
> (10) Conversion objective.** It governs all future UI design and development.
>
> **What this is not.** It is not visual design, not page copy, not code, and not new pages
> beyond the approved IA. It specifies _what each page must contain and accomplish_ — never how it
> looks or the words on it. (Homepage copy already exists as its own approved deliverable.)
>
> **Doctrine enforced on every page (non-negotiable):**
> Transportation & Operations Consulting · _35 Years of Operational Experience. Enhanced by AI._ ·
> _Built by a Business Owner. Designed for Operators._ · **Operations lead. Technology supports.
> Operational expertise is the product. AI enhances analysis, validation, and decision-making.**
> HSCS is a firm of _operators who consult — not consultants who understand operations._ No page
> markets a tool as a product; the single primary conversion is **Request an Operations Assessment.**

---

## Table of contents

1. [How to read this specification](#1-how-to-read-this-specification)
2. [Global requirements (apply to every page)](#2-global-requirements-apply-to-every-page)
3. [Page-type spec templates](#3-page-type-spec-templates)
4. [Page specifications](#4-page-specifications)
   - [4.1 Home](#41-home-)
   - [4.2 Services](#42-services)
   - [4.3 Industries](#43-industries)
   - [4.4 Experience](#44-experience-experience)
   - [4.5 Method](#45-method)
   - [4.6 Insights](#46-insights)
   - [4.7 Guides](#47-guides)
   - [4.8 About](#48-about-about)
   - [4.9 Conversion pages](#49-conversion-pages)
   - [4.10 Utility / system pages](#410-utility--system-pages)
5. [Page inventory checklist](#5-page-inventory-checklist)

- [Appendix A — Alignment matrix](#appendix-a--alignment-matrix)

---

## 1. How to read this specification

- Every page is specified against the **ten required fields** listed above.
- To avoid repetition, shared requirements live in **§2 Global requirements** (inherited by all
  pages) and **§3 Page-type templates** (inherited by all pages of a type). A per-page spec in §4
  states only its **purpose, audience, objective, SEO target, unique sections, specific links, and
  conversion objective** — everything else is inherited. "Sections: T-Service + [deltas]" means
  "the T-Service section pattern, plus these page-specific additions."
- **Codes:** service codes (S0–S9) and slugs are from IA §1. SEO targets are from IA §7. CTA rules
  are from IA §5 and Homepage Architecture §4. Linking rules are from IA §6.
- **Primary CTA default:** _Request an Operations Assessment_ → `/request-an-assessment/`. Stated
  per page only where it differs (conversion/utility pages).

---

## 2. Global requirements (apply to every page)

These are inherited by **every** page and are not repeated in §4.

- **G1 · Persistent header & footer** (IA §2; Homepage Copy S0/S12) — brand descriptor
  "Transportation & Operations Consulting," primary nav, persistent **Request an Operations
  Assessment** button (sticky on mobile), and the full footer sitemap + footer CTA band.
- **G2 · Primary CTA everywhere** — the assessment CTA appears in the header, at least one in-body
  band, and the footer band on every marketing page (IA §3.1 one-click-convert).
- **G3 · Doctrine constraints** — operator-first framing; AI never headlines as the product; no
  tool (FleetHuddle, DispatchAI, TransportationAI, Executive Dashboards, Government Logistics) is
  presented as a standalone product or given a buy/try CTA (Foundation §18).
- **G4 · Trust baseline** — approved boilerplate available in footer; honesty guarantee reachable;
  **no invented metrics, testimonials, or endorsements** anywhere (Foundation §4.5, §10.5; platform
  CLAUDE.md). Operating-record company names are experience, not endorsement, and must be
  permission-cleared before publication.
- **G5 · SEO baseline** — one primary intent per URL; unique title & meta description; descriptive
  slug (IA Appendix B); canonical tag; `BreadcrumbList` on L2/L3; page-appropriate schema (IA §7);
  fast, mobile-first, accessible; internal-link depth ≤ 3.
- **G6 · Breadcrumbs** on every L2/L3 page reflecting IA hierarchy.
- **G7 · Accessibility & performance** — WCAG-conformant structure, semantic headings, fast LCP;
  gated-guide bodies `noindex`, landings indexable.
- **G8 · Measurement** — conversion and micro-conversion events instrumented per IA §8.3; **no
  fabricated analytics**; baselines established, not assumed (Foundation §12.5, §16.4).

---

## 3. Page-type spec templates

Shared **required-section patterns**, **default CTAs**, **trust defaults**, and **linking
defaults** by page type. Per-page specs in §4 inherit these.

### T-Hub (Services, Industries, Insights, Guides hubs)

- **Sections:** (a) Hub hero — section purpose in one line + primary CTA; (b) Child index — cards
  linking every child page; (c) Why-it-matters tie-in (operator/method/experience); (d) Conversion band.
- **Primary CTA:** Request an Operations Assessment. **Secondary:** "browse children" (contextual).
- **Trust:** operating-record or method reference; no invented proof.
- **Linking:** links to all children; up to Home via breadcrumb; to the primary CTA. No dead-ends.

### T-Service (each service page S0–S9 + Government Logistics)

- **Sections:** (1) Service hero — outcome promise + primary CTA; (2) The problem this solves
  (operator framing); (3) What the engagement covers (scope); (4) How we work (method summary →
  Method); (5) Relevant operating experience/proof; (6) Related industries (bridge); (7) What you
  get (deliverable); (8) FAQ (objections + SEO); (9) Conversion band.
- **Primary CTA:** Request an Operations Assessment. **Secondary:** page-specific (mapped industry
  or Method).
- **Trust:** operating experience relevant to the service; method + honesty guarantee reference.
- **Linking:** ↔ mapped industries (IA §6.2 table); → Method; → S0 Assessment; → primary CTA.

### T-Industry (each of 5 industry pages)

- **Sections:** (1) Industry hero — "we've operated here" + primary CTA; (2) The operating proof
  (founder's experience in this vertical, as experience not endorsement); (3) Lifecycle placement
  (→ Experience anchor); (4) Operational challenges we address here; (5) Mapped services (bridge);
  (6) What you get; (7) FAQ; (8) Conversion band.
- **Primary CTA:** Request an Operations Assessment. **Secondary:** mapped service page.
- **Trust:** the real operating record for this vertical; honesty framing.
- **Linking:** ↔ mapped services; → Experience anchor; → primary CTA.

### T-Narrative (Experience, About)

- **Sections:** hero → long-form credibility narrative → proof structure → onward links to
  services/industries → conversion band. (Experience carries the six lifecycle-stage anchors;
  About carries the founder/firm story + honesty ethic.)
- **Primary CTA:** Request an Operations Assessment. **Secondary:** Explore services / industries.
- **Trust:** the 35-year operating record; the business-owner origin; the honesty ethic.
- **Linking:** Experience → every industry (via stage anchors) + mapped services; About → Experience.

### T-Method (Method hub, Assessment Framework detail)

- **Sections:** hero → four-stage method → evidence & claim classification → honesty guarantee →
  assessment-framework link/detail → conversion band.
- **Primary CTA:** Request an Operations Assessment. **Secondary:** See the assessment framework.
- **Trust:** method rigor; fact/inference/opinion labelling; honesty guarantee.
- **Linking:** → S0 Assessment; ← every service; → primary CTA.

### T-Pillar (each of 7 Insights pillar pages)

- **Sections:** (1) Pillar hero (topic overview); (2) Operator POV framing; (3) Cluster index
  (links to articles); (4) Mapped-service tie-in; (5) Related gated guide; (6) Conversion band.
- **Primary CTA:** Request an Operations Assessment. **Secondary:** download the related guide.
- **Trust:** author = founder (E-E-A-T); operating-record byline.
- **Linking:** → all cluster articles; → mapped service; → guide; → primary CTA.

### T-Article (Insights article template — the L3 spoke)

- **Sections:** (1) Header (title, founder author, date); (2) Long-form body; (3) Author/E-E-A-T
  block (operating record); (4) Related articles (2–4 siblings) + up to pillar; (5) Mapped-service
  link; (6) Inline + end conversion CTA (assessment or guide).
- **Primary CTA:** Request an Operations Assessment. **Secondary:** read the pillar / download guide.
- **Trust:** author expertise markup tying content to the real operating record.
- **Linking:** ↑ pillar, ↔ siblings, → mapped service, → primary CTA. No orphan articles.

### T-Guide (each of 5 gated guides + guide template)

- **Sections:** (1) Guide landing (value of the guide); (2) What's inside; (3) Capture form;
  (4) Trust (privacy + what happens next); (5) Post-capture routing (→ thank-you/nurture).
- **Primary CTA:** Download the guide (email capture — micro-conversion). **Secondary:** Request an
  Operations Assessment.
- **Trust:** honest description of the asset; privacy assurance; no fabricated stats inside.
- **Linking:** ← mapped Insights pillar; → assessment; landing indexable, body `noindex`.

### T-Convert (Request-an-Assessment, Contact)

- **Sections:** hero (what you're requesting + value recap) → what you get → the form → what
  happens next (no-pressure process) → trust (honesty guarantee + privacy).
- **Primary CTA:** Submit the request/message (form). **Secondary:** none that diverts (terminal).
- **Trust:** the assessment-value recap; honesty guarantee; privacy; response expectation.
- **Linking:** minimal outbound (protect the conversion); success → `/thank-you/`.

### T-Utility (thank-you, subscribe, legal, 404)

- **Sections:** minimal, purpose-specific. Thank-you: confirmation + next step (Insights/subscribe).
  Legal: content only. 404: search + links to top sections + primary CTA.
- **Primary CTA:** context-appropriate (thank-you → keep engaged; 404 → back to value).
- **Trust:** clear confirmation / accurate legal content.
- **Linking:** thank-you → Insights/subscribe; 404 → hubs + Home.

---

## 4. Page specifications

### 4.1 Home ★

Home is fully specified by the approved **Homepage Content Architecture v1.0** (sections S0–S12)
and **Homepage Copy v1.0**. This spec does not restate it. Summary for completeness:

1. **Purpose:** State the positioning in seconds and route all intent to the assessment.
2. **Audience:** All primary personas (Foundation §5) — entry point for every visitor.
3. **Business objective:** Establish positioning; drive the primary conversion.
4. **SEO objective:** Brand/entity terms; `Organization` + `WebSite` schema (IA §7).
5. **Required sections:** S0–S12 per Homepage Architecture (hero, credibility strip, lifecycle,
   why-HSCS, service ladder, method+honesty, AI clarifier, toolbox, who-we-help, what-you-get,
   closing CTA, footer).
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Explore the operating lifecycle (→ S3 / Experience).
8. **Trust:** operating-record strip; method + honesty guarantee; no invented proof.
9. **Internal linking:** to all L1 hubs, Experience, Method, top services & industries, primary CTA.
10. **Conversion objective:** Assessment request (primary macro-conversion).

### 4.2 Services

#### /services/ — Services hub _(T-Hub, L1)_

1. **Purpose:** Present the full service ladder and route to the Operations Assessment as the entry.
2. **Audience:** Operators evaluating whether HSCS solves their problem (all personas).
3. **Business objective:** Channel all service interest into the S0 front door; signal depth.
4. **SEO objective:** "operations consulting services / transportation & operations consulting";
   index of service intents; `Service`/`CollectionPage` schema.
5. **Required sections:** T-Hub + child index highlighting **Operations Assessment as "start here."**
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Start with an Operations Assessment (S0).
8. **Trust:** operator framing of the ladder; link to Method.
9. **Linking:** → all 11 service pages; → Method; → primary CTA.
10. **Conversion objective:** Route to S0 / assessment request.

#### /services/operations-assessment/ — S0 · Operations Assessment _(T-Service, L2) ★ front door_

1. **Purpose:** Convert interest into the pivotal, low-risk first engagement.
2. **Audience:** Any operator with a suspected but unquantified operational problem (esp. COO/owner).
3. **Business objective:** Maximize assessment requests — this is the funnel hinge (IA §8.2).
4. **SEO objective:** "operations assessment / logistics operations audit"; `Service` + `FAQPage`.
5. **Required sections:** T-Service + emphasized **"What you get"** (assessment outputs, Foundation
   §10.4) + **honesty guarantee** block.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See the assessment framework (→ Method detail).
8. **Trust:** the method, claim classification, honesty guarantee; the deliverable described honestly.
9. **Linking:** ← every page/CTA funnels here; → Method framework; → related services; → primary CTA.
10. **Conversion objective:** Assessment request (primary).

#### /services/transportation-fleet-optimization/ — S1 _(T-Service, L2)_

1. **Purpose:** Win transportation/fleet buyers by proving operator credibility in their domain.
2. **Audience:** Transportation Directors, Fleet Managers, VP/Director of Operations.
3. **Business objective:** Generate qualified transportation engagements via the assessment.
4. **SEO objective:** "transportation operations / fleet optimization consultant"; `Service`.
5. **Required sections:** T-Service; proof = middle-mile (Amazon) & final-mile operating experience.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See middle-mile & final-mile experience (→ Industries).
8. **Trust:** transportation operating record; method reference. Tools (TransportationAI/DispatchAI/
   FleetHuddle) mentioned only as engagement enhancers, never products.
9. **Linking:** ↔ Middle-Mile & Final-Mile industries (IA §6.2); → Method; → primary CTA.
10. **Conversion objective:** Assessment request.

#### /services/warehousing-distribution-improvement/ — S2 _(T-Service, L2)_

1. **Purpose:** Win warehousing/distribution buyers with proven DC operating experience.
2. **Audience:** Warehouse/Distribution Managers, Plant Managers, VP/Director of Operations.
3. **Business objective:** Generate qualified warehousing/distribution engagements.
4. **SEO objective:** "warehouse productivity / distribution network consultant"; `Service`.
5. **Required sections:** T-Service; proof = warehousing in food manufacturing (Sorrento/Lactalis).
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See warehousing experience (→ Warehousing & Fulfillment industry).
8. **Trust:** warehousing/distribution operating record; method reference.
9. **Linking:** ↔ Warehousing & Fulfillment, D2C/Cold-Chain industries; → Method; → primary CTA.
10. **Conversion objective:** Assessment request.

#### /services/final-mile-white-glove-delivery/ — S3 _(T-Service, L2)_

1. **Purpose:** Win final-mile/white-glove buyers with high-touch delivery operating credibility.
2. **Audience:** Final-mile & delivery ops leaders, retail/home-goods operators.
3. **Business objective:** Generate qualified final-mile/white-glove engagements.
4. **SEO objective:** "final mile / white glove delivery consulting"; `Service`.
5. **Required sections:** T-Service; proof = white glove (Herman Movers) + retail final mile
   (Lowe's, Sears, Bob's) operating experience.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See final-mile & white-glove experience (→ Industries).
8. **Trust:** delivery operating record; method reference.
9. **Linking:** ↔ Final-Mile & White-Glove industries; → Method; → primary CTA.
10. **Conversion objective:** Assessment request.

#### /services/operational-turnaround-margin-recovery/ — S4 _(T-Service, L2)_

1. **Purpose:** Capture urgent, high-intent buyers under margin/service pressure.
2. **Audience:** COOs, owners, VP Operations in distress or margin compression.
3. **Business objective:** Convert urgency into a fast-moving assessment → recovery engagement.
4. **SEO objective:** "operations turnaround / logistics margin improvement"; `Service`.
5. **Required sections:** T-Service; emphasize rapid diagnosis, stabilization, measured recovery.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See how we work (→ Method — evidence + honesty).
8. **Trust:** operator turnaround framing; measured-outcomes commitment; honesty guarantee.
9. **Linking:** ↔ all industries (margin is universal); → Method; → primary CTA.
10. **Conversion objective:** Assessment request (fast-track).

#### /services/operations-technology-advisory/ — S5 _(T-Service, L2)_

1. **Purpose:** Win buyers weighing operations software with a vendor-neutral operator's read.
2. **Audience:** COOs, Ops/IT leaders evaluating TMS/WMS/routing/telematics.
3. **Business objective:** Position HSCS as the honest broker; convert to assessment/advisory.
4. **SEO objective:** "TMS/WMS selection / routing software advisory"; `Service`.
5. **Required sections:** T-Service; emphasize **vendor-neutral, outcomes-not-licenses**; the AI
   clarifier (technology supports consulting).
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Read: technology, honestly (→ Insights tech pillar).
8. **Trust:** independence; operator's-eye; no tool sold here.
9. **Linking:** → Insights "Operations technology advisory" pillar; → Method; → primary CTA.
10. **Conversion objective:** Assessment/advisory request.

#### /services/operations-transformation-program/ — S6 _(T-Service, L2)_

1. **Purpose:** Specify the deeper, multi-quarter program for post-assessment buyers.
2. **Audience:** Committed operators ready to execute a roadmap (COO/owner).
3. **Business objective:** Grow engagement value; convert assessments into programs.
4. **SEO objective:** "operations transformation program"; `Service`.
5. **Required sections:** T-Service; emphasize sequenced execution + success metrics reported honestly.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Start with an Operations Assessment (S0).
8. **Trust:** measured-outcomes commitment; the method at program scale.
9. **Linking:** ← S0 (assessment precedes program); → Method; → primary CTA.
10. **Conversion objective:** Assessment request (as the program's entry).

#### /services/ai-enablement-for-operations/ — S7 _(T-Service, L2)_

1. **Purpose:** Offer guard-railed AI/automation **inside the operation**, framed as enhancement.
2. **Audience:** Operators exploring AI/automation without losing operating control.
3. **Business objective:** Capture AI-curious demand while holding the doctrine (AI enhances, not replaces).
4. **SEO objective:** "AI for logistics operations / automation ROI"; `Service`.
5. **Required sections:** T-Service; **prominent AI clarifier** (operator governs every deployment);
   ROI framed as measured, honest.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** How AI enhances our analysis (→ Method).
8. **Trust:** doctrine front-and-center; no black-box claims; measured outcomes.
9. **Linking:** → Method; → Insights "AI in operations" pillar; → primary CTA.
10. **Conversion objective:** Assessment request (AI-readiness angle).

#### /services/advisory-operations-leadership/ — S8 _(T-Service, L2)_

1. **Purpose:** Specify recurring, operator-level advisory (fractional judgment on call).
2. **Audience:** Leadership teams needing experienced operating judgment ongoing.
3. **Business objective:** Create recurring-relationship revenue; expansion path.
4. **SEO objective:** "fractional operations leadership / operations advisor"; `Service`.
5. **Required sections:** T-Service; emphasize ongoing operator judgment; relationship model.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Contact us.
8. **Trust:** the 35-year operating record; advisory framing.
9. **Linking:** ↔ Experience; → primary CTA / Contact.
10. **Conversion objective:** Assessment or advisory inquiry.

#### /services/executive-operations-dashboards/ — S9 _(T-Service, L2)_

1. **Purpose:** Specify ongoing, evidence-based visibility as the instrument of an engagement.
2. **Audience:** Executives wanting honest, ongoing operational visibility.
3. **Business objective:** Support expansion/retention; deepen engagements.
4. **SEO objective:** "operations executive dashboard / operations visibility"; `Service`.
5. **Required sections:** T-Service; **Executive Dashboards framed as engagement instrument, not a
   software subscription**; evidence-split (measured vs. unknown) honesty.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Start with an Operations Assessment (S0).
8. **Trust:** honesty guarantee (measured vs. unknown); no invented dashboard data shown.
9. **Linking:** ← S0; → Method; → primary CTA.
10. **Conversion objective:** Assessment request (as the entry to ongoing visibility).

#### /services/government-logistics/ — Government Logistics practice area _(T-Service, L2)_

1. **Purpose:** Present government logistics as a **consulting practice area**, not a separate
   business or product (Foundation §6.5, §7.3).
2. **Audience:** Public-sector logistics buyers; distinct compliance/accountability context.
3. **Business objective:** Make government experience available without diluting the core brand.
4. **SEO objective:** "government logistics consulting"; `Service`.
5. **Required sections:** T-Service; emphasize **practice leads, software supports**; same method,
   public-sector requirements.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Contact us (public-sector intake).
8. **Trust:** method + operating discipline; the Government Logistics platform referenced only as
   supporting capability, never as the product sold.
9. **Linking:** ← Services hub; ↔ Experience/Method; → primary CTA / Contact.
10. **Conversion objective:** Assessment or public-sector inquiry.

### 4.3 Industries

#### /industries/ — Industries hub _(T-Hub, L1)_

1. **Purpose:** Let operators self-select by vertical and prove end-to-end operating credibility.
2. **Audience:** All personas, filtering by their industry.
3. **Business objective:** Route vertical interest into services and the assessment.
4. **SEO objective:** "transportation & operations consulting by industry"; `CollectionPage`.
5. **Required sections:** T-Hub + a lifecycle framing tying the five verticals to the chain (→ Experience).
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See the full operating lifecycle (→ Experience).
8. **Trust:** the end-to-end operating record.
9. **Linking:** → all 5 industry pages; → Experience; → primary CTA.
10. **Conversion objective:** Route to industry → assessment.

**The five industry pages** (all **T-Industry, L2**) share fields 6–10 by template; unique fields below.

| Page (slug)                       | 1 Purpose                      | 2 Audience                              | 3 Business obj.                      | 4 SEO objective                                                                | 8 Trust (operating proof)                                  | 9 Key links                      |
| --------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------- |
| `warehousing-fulfillment`         | Win warehousing/DC buyers      | Warehouse/Distribution/Plant Mgrs       | Qualified warehousing engagements    | "warehouse operations consulting" (+vertical); `Service`+`Article`             | Warehousing inside a food manufacturer (Sorrento/Lactalis) | ↔ S2; → Experience #warehousing  |
| `middle-mile-logistics`           | Win middle-mile/network buyers | Transportation/Network leaders          | Qualified transportation engagements | "middle mile logistics consulting"; `Service`+`Article`                        | Middle-mile at national scale (Amazon)                     | ↔ S1; → Experience #middle-mile  |
| `direct-to-customer-cold-chain`   | Win D2C/cold-chain buyers      | Distribution leaders, F&B               | Qualified distribution engagements   | "direct-to-customer / cold chain distribution consulting"; `Service`+`Article` | D2C cold-chain distribution (Arctic Glacier)               | ↔ S2; → Experience #distribution |
| `final-mile-retail-delivery`      | Win retail final-mile buyers   | Retail final-mile/big-and-bulky leaders | Qualified final-mile engagements     | "retail final mile / big-and-bulky delivery consulting"; `Service`+`Article`   | Retail final mile (Lowe's, Sears, Bob's)                   | ↔ S3; → Experience #final-mile   |
| `white-glove-high-touch-delivery` | Win white-glove buyers         | High-touch delivery/home-goods leaders  | Qualified white-glove engagements    | "white glove delivery operations consulting"; `Service`+`Article`              | White-glove home delivery (Herman Movers)                  | ↔ S3; → Experience #white-glove  |

- **6 Primary CTA (all):** Request an Operations Assessment.
- **7 Secondary CTA (all):** See the mapped service (S1/S2/S3).
- **10 Conversion objective (all):** Assessment request (vertical-qualified).
- **Trust caveat (all):** operating-record names are experience, not endorsement; permission-clear before publish (G4).

### 4.4 Experience (`/experience/`) _(T-Narrative, L1)_

1. **Purpose:** Prove the 35-year, end-to-end operating record — the site's credibility engine.
2. **Audience:** Every persona, especially the Owner-Operator CEO (recognition/trust).
3. **Business objective:** Convert credibility into relevance and route to the assessment.
4. **SEO objective:** founder/authority & entity signals (E-E-A-T), not competitive keywords;
   `Person` + `AboutPage` (IA §7).
5. **Required sections:** hero (35 yrs, enhanced by AI) → the through-line → **six lifecycle-stage
   sections with anchors** (`#manufacturing #warehousing #middle-mile #distribution #final-mile
#white-glove`) → why it matters to the buyer → onward to services/industries → conversion band.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Explore our services.
8. **Trust:** the real operating record across all six stages; business-owner origin; honesty ethic.
   No fabricated metrics; names as experience (G4).
9. **Linking:** stage anchors ↔ each industry page; → mapped services; ← industries/About link in.
10. **Conversion objective:** Assessment request (credibility-led).

### 4.5 Method

#### /method/ — Method hub _(T-Method, L1)_

1. **Purpose:** Show _how_ the work is done and why it can be trusted.
2. **Audience:** Evaluating operators (esp. evidence-driven COOs).
3. **Business objective:** De-risk the decision; move Evaluation → assessment request.
4. **SEO objective:** "how operations assessment works / evidence-based operations consulting";
   `AboutPage` + `FAQPage`.
5. **Required sections:** hero → four-stage method (Assess→Analyze→Recommend→Transform) → evidence &
   fact/inference/opinion classification → **honesty guarantee** → AI clarifier → framework link →
   conversion band.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** See the assessment framework.
8. **Trust:** method rigor; claim classification; honesty guarantee; AI-as-enhancer doctrine.
9. **Linking:** → S0 Assessment; → framework detail; ← every service; → primary CTA.
10. **Conversion objective:** Assessment request (trust-led).

#### /method/operations-assessment-framework/ — Assessment framework detail _(T-Method, L2)_

1. **Purpose:** Detail the assessment instrument for buyers who need to see the rigor.
2. **Audience:** Analytical buyers; technical/ops evaluators.
3. **Business objective:** Convert scrutiny into confidence → assessment request.
4. **SEO objective:** "operations assessment framework / scoring"; `Article` + `FAQPage`.
5. **Required sections:** hero → assessed domains (Foundation §10.1) → scoring & evidence model →
   output artifacts → honest-baselines note → conversion band.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Request your Operations Assessment (reinforced).
8. **Trust:** evidence model; claim classification; honest baselines (unknown = measured, not guessed).
9. **Linking:** ← Method hub, ← S0; → primary CTA.
10. **Conversion objective:** Assessment request.

### 4.6 Insights

#### /insights/ — Insights hub (blog root) _(T-Hub, L1)_

1. **Purpose:** Authority home base; entry for informational/topic search and LinkedIn traffic.
2. **Audience:** Operators researching problems (top of funnel); the buyer on LinkedIn.
3. **Business objective:** Build authority; feed the funnel toward the assessment.
4. **SEO objective:** topic index across all clusters; `Blog`.
5. **Required sections:** T-Hub + index of the 7 pillars + subscribe prompt.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Subscribe to Insights.
8. **Trust:** founder authorship/expertise (E-E-A-T).
9. **Linking:** → all 7 pillars; → guides; → primary CTA.
10. **Conversion objective:** Subscribe (micro) + route to assessment.

**The seven pillar pages** (all **T-Pillar, L2**) — shared fields 6–10 by template; unique below.
Each maps to a Foundation §12 cluster and IA §7 intent.

| Pillar (slug under `/insights/`)  | 1 Purpose                                  | 4 SEO objective (theme)                                    | Mapped service | Related guide                  |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | -------------- | ------------------------------ |
| `transportation-fleet-operations` | Own transportation/fleet topic authority   | transportation ops / fleet utilization / dispatch          | S1             | Transportation & Fleet guide   |
| `warehouse-distribution`          | Own warehouse/DC topic authority           | warehouse productivity / distribution network / throughput | S2             | Warehouse & Distribution guide |
| `final-mile-white-glove`          | Own final-mile/white-glove topic authority | final mile / white glove / big-and-bulky delivery          | S3             | Final-Mile & White-Glove guide |
| `operations-turnaround-margin`    | Own turnaround/margin topic authority      | operations turnaround / margin improvement                 | S4             | Operations Turnaround guide    |
| `operations-technology-advisory`  | Own ops-tech advisory topic authority      | TMS/WMS selection / routing software advisory              | S5             | (tech advisory content)        |
| `ai-in-operations`                | Own AI-in-ops topic (enhancement framing)  | AI for logistics ops / automation ROI                      | S7             | (AI-readiness content)         |
| `operations-assessment`           | Own the front-door topic                   | operations assessment / operations audit                   | S0             | Operations Assessment guide    |

- **6 Primary CTA (all):** Request an Operations Assessment. **7 Secondary (all):** Download the related guide.
- **8 Trust (all):** founder authorship + operating-record byline (E-E-A-T). **No AI-hype in the AI pillar** — enhancement framing only.
- **9 Linking (all):** → all cluster articles; → mapped service; → related guide; → primary CTA.
- **10 Conversion (all):** Guide download / subscribe (micro) → assessment.

#### Insights article template (`/insights/<cluster>/<article>/`) _(T-Article, L3)_

1. **Purpose:** Capture long-tail topic intent; demonstrate operator thinking; feed the funnel.
2. **Audience:** Operators researching a specific problem/question.
3. **Business objective:** Organic acquisition + authority → assessment.
4. **SEO objective:** one long-tail intent per article; `Article` + author markup.
5. **Required sections:** T-Article (header/author/date → body → E-E-A-T block → related+pillar →
   mapped service → inline/end CTA).
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Read the pillar / download the guide.
8. **Trust:** founder authorship; operating-record expertise; sources for any claim (no invented stats).
9. **Linking:** ↑ pillar, ↔ 2–4 siblings, → mapped service, → primary CTA. **No orphan.**
10. **Conversion objective:** Micro (guide/subscribe) → assessment.

_[Note: individual articles are produced over time per the content plan (Foundation §13). This
template governs each; no fixed article list is enumerated here — that is content, not IA.]_

### 4.7 Guides

#### /guides/ — Guides hub _(T-Hub, L1)_

1. **Purpose:** Present the lead-magnet library; top of the assessment funnel.
2. **Audience:** Operators wanting a takeaway before talking to anyone.
3. **Business objective:** Email capture → nurture → assessment.
4. **SEO objective:** "operations guides / logistics operations resources"; `CollectionPage`.
5. **Required sections:** T-Hub + index of the 5 guides.
6. **Primary CTA:** Download a guide (capture). **7 Secondary:** Request an Operations Assessment.
7. **Trust:** honest asset descriptions; privacy assurance.
8. **Linking:** → 5 guides; ← Insights pillars; → primary CTA.
9. **Conversion objective:** Guide download (micro-conversion).

**The five gated guides** (all **T-Guide, G**) — shared fields by template; unique purpose/mapping below.

| Guide (slug under `/guides/`)           | 1 Purpose                                                      | 2 Audience                      | Mapped pillar/service      |
| --------------------------------------- | -------------------------------------------------------------- | ------------------------------- | -------------------------- |
| `transportation-fleet-operations-guide` | Capture transportation/fleet leads                             | Transportation/Fleet leaders    | Transportation pillar / S1 |
| `warehouse-distribution-guide`          | Capture warehousing/DC leads                                   | Warehouse/Distribution leaders  | Warehouse pillar / S2      |
| `final-mile-white-glove-guide`          | Capture final-mile/white-glove leads                           | Final-mile/delivery leaders     | Final-mile pillar / S3     |
| `operations-turnaround-guide`           | Capture turnaround/margin leads                                | COOs/owners under pressure      | Turnaround pillar / S4     |
| `operations-assessment-guide`           | Explain what an assessment delivers; capture high-intent leads | Any assessment-curious operator | Assessment pillar / S0     |

- **3 Business objective (all):** email capture → nurture → assessment. **4 SEO (all):** landing
  indexable ("<topic> guide"), gated body `noindex`; `Article`.
- **6 Primary CTA (all):** Download the guide (capture). **7 Secondary (all):** Request an Operations Assessment.
- **8 Trust (all):** honest description, privacy, "what happens next"; **no fabricated stats inside the asset.**
- **9 Linking (all):** ← mapped pillar; → assessment; success → thank-you/nurture.
- **10 Conversion (all):** Guide download (micro) → nurtured assessment request.

### 4.8 About (`/about/`) _(T-Narrative, L1)_

1. **Purpose:** Establish the firm and the founder — "built by a business owner."
2. **Audience:** Trust-checking buyers (esp. Owner-Operator CEO); referrals.
3. **Business objective:** Convert trust into an assessment request.
4. **SEO objective:** brand/entity ("Herman Supply Chain Solutions / founder"); `AboutPage` + `Organization`.
5. **Required sections:** hero (firm + founder) → founder/business-owner story → values & honesty
   ethic → operating-record summary (→ Experience) → conversion band.
6. **Primary CTA:** Request an Operations Assessment.
7. **Secondary CTA:** Read the operating record (→ Experience).
8. **Trust:** founder story; the honesty ethic (values, Foundation §2.3); no invented accolades.
9. **Linking:** → Experience; → Services; → primary CTA.
10. **Conversion objective:** Assessment request (trust-led).

### 4.9 Conversion pages

#### /request-an-assessment/ — Assessment intake _(T-Convert, L1) ★ primary conversion_

1. **Purpose:** Capture the primary conversion with minimal friction and maximum reassurance.
2. **Audience:** Ready-to-act operators from any journey.
3. **Business objective:** Maximize completed assessment requests (the site's #1 goal).
4. **SEO objective:** brand + "request operations assessment"; `ContactPage`; indexable but
   conversion-optimized (not keyword-competitive).
5. **Required sections:** hero (what you're requesting + value recap) → what you get (assessment
   outputs) → **intake form** → what happens next (no-pressure) → trust (honesty guarantee + privacy).
6. **Primary CTA:** Submit the assessment request (form).
7. **Secondary CTA:** none that diverts (terminal); micro-fallback only if form abandoned.
8. **Trust:** value recap; honesty guarantee; privacy; response-time expectation; "a conversation,
   not a commitment."
9. **Linking:** minimal outbound (protect conversion); success → `/thank-you/`.
10. **Conversion objective:** **Assessment request submitted (primary macro-conversion).**

#### /contact/ — General contact _(T-Convert, L1)_

1. **Purpose:** Capture non-assessment inquiries (advisory, government, press, general).
2. **Audience:** Buyers/partners not entering via the assessment.
3. **Business objective:** Route qualified inquiries to sales without losing them.
4. **SEO objective:** brand + "contact"; `ContactPage`.
5. **Required sections:** hero → contact form + methods → what happens next.
6. **Primary CTA:** Send message (form). **7 Secondary:** Request an Operations Assessment.
7. **Trust:** response expectation; privacy.
8. **Linking:** → assessment; success → `/thank-you/`.
9. **Conversion objective:** Contact submitted (secondary macro-conversion).

### 4.10 Utility / system pages _(T-Utility, U)_

| Page                          | 1 Purpose                                      | 5 Required sections                          | 6 Primary CTA                    | 10 Conversion objective           |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------- | -------------------------------- | --------------------------------- |
| `/thank-you/`                 | Confirm a conversion; keep the visitor engaged | Confirmation + what-happens-next + next step | Read Insights / Subscribe        | Retain engagement; nurture opt-in |
| `/insights/subscribe/`        | Confirm newsletter opt-in                      | Confirmation + expectation                   | Explore Insights                 | Confirmed subscription            |
| `/privacy-policy/`            | Legal transparency (data handling)             | Policy content                               | — (footer CTA only)              | Trust/compliance                  |
| `/terms-of-service/`          | Legal terms                                    | Terms content                                | —                                | Trust/compliance                  |
| `/accessibility/`             | Accessibility statement                        | Statement content                            | —                                | Trust/compliance                  |
| `/404`                        | Recover lost visitors                          | Message + search + top-section links + CTA   | Request an Operations Assessment | Recover to a value page           |
| `/sitemap.xml`, `/robots.txt` | Machine crawl/index directives                 | Generated from IA §1 tree                    | —                                | Crawl efficiency (G5)             |

- **2 Audience (all):** any visitor. **3 Business objective (all):** support trust, recovery, or
  crawlability without diluting the primary funnel. **4 SEO (all):** utility/legal typically
  `noindex` except `sitemap.xml`/`robots.txt`; 404 returns proper status. **7–9 (all):** inherit
  T-Utility; legal pages carry no marketing CTA beyond the global footer band. **8 Trust (all):**
  accurate, honest content; no dark patterns.

---

## 5. Page inventory checklist

Every page in IA §1 is specified above. Coverage:

| IA section     | Pages                                                  | Specified in                        |
| -------------- | ------------------------------------------------------ | ----------------------------------- |
| Home           | 1                                                      | §4.1 (+ Homepage Architecture/Copy) |
| Services       | hub + 10 services + Government Logistics (12)          | §4.2                                |
| Industries     | hub + 5 industries (6)                                 | §4.3                                |
| Experience     | 1                                                      | §4.4                                |
| Method         | hub + framework (2)                                    | §4.5                                |
| Insights       | hub + 7 pillars + article template (9)                 | §4.6                                |
| Guides         | hub + 5 guides (6)                                     | §4.7                                |
| About          | 1                                                      | §4.8                                |
| Conversion     | Request-an-Assessment + Contact (2)                    | §4.9                                |
| Utility/system | thank-you, subscribe, 3 legal, 404, sitemap/robots (7) | §4.10                               |

**Total: every L0/L1/L2 page + the L3 article and G guide templates + utility/system pages.** No
page in the approved IA is unspecified; no page outside the approved IA is introduced.

---

## Appendix A — Alignment matrix

| This spec                                      | Source of truth                                        |
| ---------------------------------------------- | ------------------------------------------------------ |
| Page set (§4, §5)                              | IA §1 sitemap                                          |
| Required-section templates (§3)                | IA §3.3 template classes; Homepage Architecture (Home) |
| Primary/secondary CTAs (§2 G2, §3, §4)         | IA §5; Homepage Architecture §4                        |
| SEO objectives (§4)                            | IA §7 SEO page mapping                                 |
| Internal linking (§2 G6, §3, §4)               | IA §6 linking strategy                                 |
| Conversion objectives (§4)                     | IA §8 funnel architecture                              |
| Trust & credibility (§2 G4, §3, §4)            | Foundation §8, §10.5; §4.5 honesty rules               |
| Doctrine constraints (§2 G3)                   | Foundation §3.3, §18                                   |
| Audience per page (§4)                         | Foundation §5 personas                                 |
| Honesty (no invented data; names = experience) | Foundation §4.5, §12.5, §16.4; platform CLAUDE.md      |

---

> **Operations lead. Technology supports. Operational expertise is the product. AI enhances
> analysis, validation, and decision-making.**

_This is the implementation specification. UI design and development build on it; they do not
redefine it. New or changed pages are specified here first — in the sitemap (IA §1) and this
document — before they are designed or built._

_Version 1.0 — complete and ready for approval._
