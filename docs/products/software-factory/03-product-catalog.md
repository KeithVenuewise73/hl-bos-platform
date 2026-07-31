# Software Factory · 03 — Product & Opportunity Catalog (Parts 4 & 5)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `OPPORTUNITY_CATALOG` + `productCatalog()` in `packages/catalog/src/portfolio.ts`.
Assembly %, net-new count, priority and lifecycle stage are **computed** from the live Factory
registry (`assembleBlueprint`) — not asserted. Table below is live output.

## The master catalog — every known software opportunity (Part 5)

20 opportunities, drawn from the existing HLVS/catalog record, the Venuewise harvest, and the
transformation-intelligence government/asset-recovery work. **No unsupported product was
invented**: opportunities whose vertical is not yet specified are marked `concept` and carry the
horizontal spine plus an explicit net-new placeholder, so their assembly % is honest.

| Product                 | Line       | Maturity  | Assembly % | Net-new | Priority | Lifecycle stage            |
| ----------------------- | ---------- | --------- | :--------: | :-----: | :------: | -------------------------- |
| HL-BTI                  | consulting | live      |    100     |    0    |  **P1**  | ceo_approval               |
| Government Intelligence | government | live      |    100     |    0    |  **P1**  | ceo_approval               |
| VisibilityAI            | service    | prototype |    100     |    0    |  **P1**  | commercialization_analysis |
| Review Management       | service    | prototype |    100     |    0    |  **P1**  | commercialization_analysis |
| Reputation Recovery     | service    | prototype |    100     |    0    |  **P1**  | commercialization_analysis |
| Sports Intelligence     | sports     | prototype |    100     |    0    |  **P1**  | commercialization_analysis |
| SalonAI                 | service    | planned   |     86     |    1    |  **P1**  | capability_search          |
| TransportationAI        | logistics  | planned   |     83     |    1    |  **P1**  | capability_search          |
| Education               | vertical   | concept   |     86     |    1    |    P2    | idea_discovery             |
| Healthcare              | vertical   | concept   |     86     |    1    |    P2    | idea_discovery             |
| ContractorAI            | service    | concept   |     83     |    1    |    P2    | idea_discovery             |
| FleetHuddle             | logistics  | concept   |     83     |    1    |    P2    | idea_discovery             |
| HockeyIQ                | sports     | concept   |     80     |    2    |    P2    | idea_discovery             |
| FootballIQ              | sports     | concept   |     80     |    2    |    P2    | idea_discovery             |
| Mental Wellness         | vertical   | concept   |     80     |    1    |    P2    | idea_discovery             |
| ReceptionAI             | service    | planned   |     75     |    1    |    P2    | capability_search          |
| BroadcastAI             | media      | concept   |     75     |    1    |    P2    | idea_discovery             |
| AI Persona              | horizontal | concept   |     75     |    1    |    P2    | idea_discovery             |
| Freight Intelligence    | logistics  | concept   |     60     |    2    |    P2    | idea_discovery             |
| Asset Recovery          | vertical   | legacy    |     75     |    1    |    P3    | portfolio_review           |

## Every product record carries (Part 4)

Each `ProductRecord` includes all seventeen fields the brief asks for:

| Field                      | Source                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Product Name / Description | curated seed                                                                       |
| Target Market              | curated seed                                                                       |
| Business Owner             | from the registry where known, else **`unassigned`** (never invented)              |
| Current Status             | computed from maturity + assembly                                                  |
| Manufacturing Line         | curated (consulting/service/logistics/sports/media/government/vertical/horizontal) |
| Commercialization Model    | proposed revenue model + computed L1–L5 layers                                     |
| Capabilities Required      | curated capability terms                                                           |
| Current Assembly %         | **computed** by `assembleBlueprint`                                                |
| Net-New Engineering        | **computed** (the blueprint's net-new list)                                        |
| Revenue Model              | proposed structure (e.g. "Subscription (proposed)") — never a fabricated price     |
| Priority                   | **computed** engineering-readiness (P1–P4); business priority remains the CEO's    |
| Dependencies               | curated                                                                            |
| ROI                        | **`not_estimated`** — requires a real assessment                                   |
| Market Size                | **`not_estimated`** — requires market research                                     |
| Current Customers          | **0** — nothing is commercially live (honest)                                      |
| Future Opportunities       | curated                                                                            |

## Honesty controls (Principle 10)

- **ROI and Market Size are never fabricated** — both are `not_estimated` with the reason. The
  brief asks for them; honesty requires we mark them unknown until a real assessment produces
  them.
- **Current Customers is 0 for every product** — because nothing is deployed to customers yet.
  An empty number that is true beats a flattering one that lies.
- **Priority is engineering-readiness, not business priority.** A high assembly % means "cheap
  to build," not "most valuable" — the CEO sets business priority. `concept` opportunities are
  capped below P1 because their single net-new placeholder stands for an entire unspecified
  vertical.
- **`concept` ≠ ready.** Education at 86% assembly does **not** mean it is 86% built — it means
  its horizontal spine exists and its entire vertical ("education vertical workflows") is the
  one net-new item still to be specified and built.

## How to read it

The six **assemblable-now** products (100% assembly, 0 net-new) are the ones the CEO can
greenlight for assembly today. The **P1** set is the highest engineering-readiness. The
`concept` verticals are real opportunities that reuse the spine but still need their vertical
specified and built — cheap relative to greenfield, not free.
