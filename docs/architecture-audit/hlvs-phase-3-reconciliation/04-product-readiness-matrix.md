# 04 · Product Readiness Matrix

Every Herman Legacy product ranked by the seven dimensions in the directive. Completion % is an honest engineering estimate against real evidence (schema built? engine? UI? tests? deployed? live customer?), **not** a flattering number. "Reuse score" = share of the product that comes from the already-built shared spine.

**Legend** — Commercial readiness: 🟢 ready-soon · 🟡 needs work · 🔴 far / not started · ⚫ legacy(out of scope). Effort: S (days) · M (weeks) · L (1–2 months) · XL (quarters). Deployment: Deploy = build done, needs runtime; Build = needs development; N/A = legacy.

| Product                                                                 |                                        Completion |  Commercial   |        Effort remaining         |       Strategic importance       |   Revenue potential    |             Reuse score |     Deployment      |
| ----------------------------------------------------------------------- | ------------------------------------------------: | :-----------: | :-----------------------------: | :------------------------------: | :--------------------: | ----------------------: | :-----------------: |
| **HL-BOS** (platform)                                                   |                                           **90%** | 🟢 (enabler)  |       M (deploy runtime)        |             Critical             | Indirect (enables all) |     100% (is the spine) |       Deploy        |
| **Enterprise Catalog**                                                  |                                           **90%** | 🟢 (internal) |                S                |               High               |        Indirect        |                     95% | Deploy (runs local) |
| **CEO Control Center**                                                  |                                           **95%** | 🟢 (internal) |                S                |               High               |        Indirect        |                     90% |    Live (local)     |
| **HL-BTI**                                                              |                                           **80%** |      🟢       |    M (deploy + 1st customer)    |               High               | **High** (consulting)  |                     85% |       Deploy        |
| **VisibilityAI**                                                        |                                           **40%** |      🟡       |      L (UI + scan worker)       | **High** (front door / lead gen) |        **High**        |                     80% |    Build+Deploy     |
| **SalonAI**                                                             |                                           **20%** |      🟡       |      L (assemble vertical)      |              Medium              |         Medium         |                     85% |        Build        |
| **HomeHuddle**                                                          |                                           **20%** |      🟡       |      L (community domain)       |              Medium              |         Medium         |                     70% |        Build        |
| **ReceptionAI**                                                         |                                           **15%** |      🟡       |   L (AI receptionist engine)    |              Medium              |         Medium         |                     70% |        Build        |
| **TransportationAI**                                                    |                                           **15%** |      🔴       |   L (route-assessment engine)   |             Low–Med              |         Medium         |                     75% |        Build        |
| **AthleteHuddle / CoachesHuddle / OrganizationHuddle / FacilityHuddle** | **15%** (live in legacy Venuewise; ~0% on HL-BOS) |      🟡       | L each (re-implement on spine)  |              Medium              |         Medium         |                     70% |        Build        |
| **5-Star Sports Media**                                                 |                      **15%** (live legacy static) |      🟡       | L (CMS/Academy/Podcast domains) |             Low–Med              |         Medium         |                     60% |        Build        |
| **Review Management** (product)                                         |                                           **30%** |      🟡       | M (`visibility.reviews` exists) |              Medium              |         Medium         |                     80% |        Build        |
| **Reputation Recovery** (product)                                       |                                           **25%** |      🟡       |                M                |              Medium              |         Medium         |                     80% |        Build        |
| **Venuewise Core**                                                      |                 **60%** (live, separate platform) |      🟡       | XL (convergence) or 0 (coexist) |   **High** (strategic overlap)   |         Medium         | n/a (parallel platform) |    CEO decision     |
| **HighlightAI**                                                         |                                            **0%** |      🔴       |    XL (greenfield video-AI)     |      High (differentiator)       |    **High** (media)    |        20% (spine only) |        Build        |
| **BroadcastAI**                                                         |                                            **0%** |      🔴       |    XL (greenfield streaming)    |              Medium              |      Medium–High       |                     15% |        Build        |
| **CoachAI / FleetHuddle / LandscapeAI**                                 |                                            **5%** |      🔴       |             L each              |               Low                |        Low–Med         |                     80% |        Build        |
| **HLVS Venture Studio**                                                 |                                         ⚫ legacy |      ⚫       |               N/A               |               n/a                |          n/a           |                     n/a |         N/A         |
| **HSCS Government Logistics (HSCS-GLP)**                                |                             ⚫ legacy (74 tables) |      ⚫       | N/A (separate approved effort)  |    Medium (existing revenue?)    |        Unknown         |                     n/a |         N/A         |
| **RecoveryWise / AI Asset Recovery**                                    |                                 ⚫ legacy (SEC-2) |      ⚫       |               N/A               |               Low                |        Unknown         |                     n/a |         N/A         |

## How to read this

- **The high-reuse cluster (70–100%)** — VisibilityAI, HL-BTI, SalonAI, the Huddles, Review/Reputation products — are cheap to finish because the spine is built. Their remaining effort is **assembly and UI**, not foundations.
- **The low-reuse cluster (0–20%)** — HighlightAI, BroadcastAI — are expensive because the _capability itself_ doesn't exist. Treat these as genuine new-product investments, not catalog fills.
- **Venuewise Core** is the wildcard: 60% "complete" but on a _different_ platform. Its effort is a **strategic choice** (converge = XL, coexist = 0), not a build backlog.
- **Legacy products** are revenue that exists but is unreachable and out of scope; any work needs a separate approved plan.

## Completion of the overall vision

Weighting by strategic importance and counting the shared spine once:

- **Platform foundation:** ~90% complete (built, tested; runtime not switched on).
- **Flagship products (HL-BTI, VisibilityAI):** ~60% and ~40%.
- **Vertical catalog (SalonAI, Huddles, etc.):** ~15–20% — but ~75% _reusable_, so fast to finish.
- **Net-new frontier (video/broadcast AI):** ~0%.

**One-line verdict:** the _platform_ vision is nearly done; the _product_ vision is an assembly backlog on top of it, plus one genuinely new frontier (media AI). Herman Legacy owns far more than it has shipped.
