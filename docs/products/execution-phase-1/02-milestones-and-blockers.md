# Execution Phase 1 · 02 — Milestones & blocker register

**Planning only.** Measurable milestones culminating in the **first paying recurring
customers**, plus the blockers that gate them and who clears each.

## The milestone ladder (to first recurring revenue and beyond)

Targets are **structural** (dates are elapsed-from-ignition; dollar amounts are **yours to
set** — no figures invented). "Recurring" = MRR from a monthly managed-service retainer or a
subscription.

| Milestone                            | When (from ignition) | Definition of done (measurable)                                                                                                            | Owner        |
| ------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| **M0 · Ignition**                    | Week 0               | Anthropic key granted · deploy authorized · HL-BTI retainer terms set · hosting + domain confirmed                                         | 🔑 CEO       |
| **M1 · HL-BTI live on production**   | Week 1–2             | App reachable at `bti.hermanlegacygroup.com`; live AI seam verified; consultant login works; IAT-001 deployment-state FAIL cleared         | ⚙️ Eng       |
| **M2 · First engagement delivered**  | Week 2–4             | One real assess→blueprint→proposal completed on production; a client-ready deliverable produced                                            | ⚙️ Eng + GTM |
| **M3 · FIRST RECURRING CUSTOMER** ⭐ | **Week 4–6**         | First monthly managed-service **retainer signed**; **first recurring invoice issued (MRR > 0)**                                            | 🔑 CEO/GTM   |
| **M4 · HL-BTI productized**          | Week 6–10            | 3 evidence bridges shipped; app surfaces the work + produces the deliverable + shows evidence provenance; ≥1 retainer renewed/expanded     | ⚙️ Eng       |
| **M5 · Scalable recurring live**     | Week 10–14           | VisibilityAI security hardening done; scan workers + UI deployed; **first self-serve subscription customer**; Review Mgmt upsell available | ⚙️ Eng + GTM |
| **M6 · Recurring base**              | Week 14+             | **N recurring customers / target MRR** (N and $ set by CEO); repeatable acquisition motion proven                                          | 🔑 CEO/GTM   |

**The culmination of Execution Phase 1 is M3 — the first paying recurring customer** — reached
by deploying an already-built product and signing a retainer. M5 turns recurring from
consultant-delivered into _scalable_ self-serve.

## KPI dashboard (track weekly — real numbers only, per the honesty rule)

| KPI                                 | Baseline today                       | Target (CEO to set)     |
| ----------------------------------- | ------------------------------------ | ----------------------- |
| Recurring customers                 | 0                                    | ≥1 by M3                |
| MRR                                 | $0                                   | > $0 by M3; $X by M6    |
| Time-to-first-recurring             | —                                    | ≤ 6 weeks from ignition |
| Engagements delivered on production | 0                                    | ≥1 by M2, ≥3 by M5      |
| HL-BTI deployment status            | backend live; app/runtime undeployed | fully deployed by M1    |
| Self-serve subscriptions            | 0                                    | ≥1 by M5                |

_No metric is reported unless it actually happened. Empty = "not yet," never a fabricated
green._

## Blocker register (every blocker, its owner, and the unblock action)

| #      | Blocker                                                                             | Blocks                                  | Owner             | Unblock action                                                               | Type        |
| ------ | ----------------------------------------------------------------------------------- | --------------------------------------- | ----------------- | ---------------------------------------------------------------------------- | ----------- |
| **B1** | Anthropic API key not granted (AI seam keyless)                                     | M1, all AI features                     | 🔑 CEO            | Grant the key (trust decision)                                               | Ignition    |
| **B2** | Deploy not authorized; hosting not confirmed                                        | M1 (everything)                         | 🔑 CEO → ⚙️ Eng   | Authorize deploy; confirm Docker/Coolify hosting; grant infra access         | Ignition    |
| **B3** | HL-BTI commercial terms unset (`pending-ceo`)                                       | M3 (can't invoice)                      | 🔑 CEO            | Set the monthly retainer price/model                                         | Commercial  |
| **B4** | `bti.hermanlegacygroup.com` not pointed                                             | M1 (app URL)                            | 🔑 CEO            | Point DNS to the deploy target                                               | Ignition    |
| **B5** | Stripe adapter stubbed (501)                                                        | Self-serve subscriptions (M5)           | ⚙️ Eng (after B3) | **Workaround:** bill retainers out-of-band first; finish adapter only for M5 | Engineering |
| **B6** | VisibilityAI live-egress/SSRF guard unbuilt                                         | M5 (real-site scans)                    | ⚙️ Eng            | Build the connect-time IP-pin/SSRF control before any real scan              | Engineering |
| **B7** | No first-customer named                                                             | M2–M3                                   | 🔑 CEO/GTM        | Select the first engagement from the warm HSCS pipeline                      | Commercial  |
| **B8** | Supabase Auth email/SMTP + leaked-password protection not configured for real users | M1 (consultant/customer login at scale) | ⚙️ Eng + 🔑 CEO   | Configure auth email + enable leaked-password protection (advisor flagged)   | Engineering |

**The critical blockers to the first recurring customer (M3) are B1–B4 and B7 — all CEO
decisions.** Engineering blockers (B5, B6, B8) gate the _scalable_ recurring wave (M5), not the
first retainer.

## What is explicitly NOT in Execution Phase 1

- No new platform, no new schemas, no redesign (Engineering Law #1).
- No SalonAI/TransportationAI build (P3 — after the first recurring base).
- No legacy migration (the legacy project stays quarantined).
- No net-new engines (ReceptionAI/route/video) — deferred until a named customer justifies one.

## The single decision that starts the revenue clock

Everything waits on **M0 ignition** — a small set of **CEO trust decisions** (key, deploy,
retainer terms, domain, first customer). The moment those land, engineering deploys an
already-built product and the path to the first recurring invoice is **4–6 weeks of execution,
not construction.**
