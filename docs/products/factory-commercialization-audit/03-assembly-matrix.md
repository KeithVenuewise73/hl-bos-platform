# Software Factory Audit · 03 — Assembly Matrix

**Audit only. No code. Engineering Law #1: ASSEMBLE, DO NOT REBUILD.**

How every viable product is assembled from **existing** capabilities. This is the reuse map:
green means "already built — compose it," and the only real work is the small **➕ net-new**
column plus deployment.

**Legend:** ✅ built & reusable · ◐ built but runtime undeployed (or mock-only) · ➕ **net-new
work required** · — not applicable · 🔒 live on prod, sealed.

## The matrix

| Product                           | Spine (9 modules) | Identity | AI Gateway | Discovery | Website/SEO | Reviews / Reputation | Scoring | BTI dashboards | Billing | Commerce / Provisioning | Knowledge Graph | ➕ Net-new to build                                             |  Deploy needed   |
| --------------------------------- | :---------------: | :------: | :--------: | :-------: | :---------: | :------------------: | :-----: | :------------: | :-----: | :---------------------: | :-------------: | --------------------------------------------------------------- | :--------------: |
| **HL-BTI** (launch #1)            |        ✅         |    ✅    |  ◐ (key)   |    ✅     |      —      |          —           |   ✅    |       ✅       |    ◐    |           ✅            |       🔒        | **3 evidence bridges** (13 reused / 3 mod / 3 new)              | app + ai-gateway |
| **VisibilityAI** (launch #2)      |        ✅         |    ✅    |     ◐      |    ✅     |   ◐ mock    |          ◐           |   ✅    |       —        |    ◐    |           ✅            |       🔒        | **live-egress + SSRF guard**, customer UI                       |  workers + app   |
| **Review Management**             |        ✅         |    ✅    |     —      |    ✅     |      —      |          ◐           |    —    |       —        |    ◐    |            —            |        —        | UI + config                                                     |       app        |
| **Reputation Recovery**           |        ✅         |    ✅    |     ◐      |    ✅     |      —      |          ◐           |    —    |       —        |    ◐    |            —            |        —        | UI + workflows wiring                                           |       app        |
| **SalonAI** (first full vertical) |        ✅         |    ✅    |     ◐      |    ✅     |      —      |          ◐           |   ✅    |       ◐        |    ◐    |           ✅            |        —        | **salon domain, booking/calendar, 3 app surfaces, public site** |       app        |
| **TransportationAI**              |        ✅         |    ✅    |     ◐      |    ✅     |      —      |          —           |   ✅    |       —        |    ◐    |           ✅            |        —        | **route-assessment engine** + app                               |       app        |
| **ReceptionAI**                   |        ✅         |    ✅    |     ◐      |    ✅     |      —      |          —           |    —    |       —        |    ◐    |           ✅            |        —        | **AI-receptionist engine + telephony**                          |       app        |
| **HomeHuddle**                    |        ✅         |    ✅    |     ◐      |    ✅     |      —      |          —           |   ✅    |       —        |    ◐    |           ✅            |        —        | community domain + app **+ Venuewise decision**                 |       app        |

_Not in the matrix — no assembly exists:_ **AthleteHuddle** (not found), **5-Star Sports
Media** (external sites only), **FleetHuddle** (name-only stub), **CoachAI** (name-only stub;
external CoachesHuddle app is unrelated), **Venuewise** (brand / business decision). These
have `reusableModules: []` and no composition; they are future greenfield, not reuse.

## How to read the columns

- **Everything left of "➕ Net-new" is already built.** The 9-module spine + identity are
  reused by _every_ product with zero new work. The database for all of these is **already on
  production** (18 schemas / ~130 tables).
- **◐ (key)** on AI Gateway = the code is built and deployed to prod at the DB layer; it needs
  the **Anthropic key** and the edge runtime turned on — a decision + deploy, not a build.
- **◐ mock** on Website/SEO = the scanner is real but runs on mock providers; a **live-egress
  security control (SSRF guard)** is the one hard piece before it touches real sites.
- **The ➕ column is the entire delta to a shippable product.** For HL-BTI it is _three
  evidence bridges_ (reuse-first). For SalonAI it is a _domain + app surfaces_. For
  TransportationAI/ReceptionAI it is _one net-new engine_. Nothing requires rebuilding the
  platform.

## The reuse dividend, quantified

| Product                           | Modules reused (of ~19) |      Net-new engines       |     Net-new app surface     | Verdict                        |
| --------------------------------- | :---------------------: | :------------------------: | :-------------------------: | ------------------------------ |
| HL-BTI                            |           ~15           |             0              | already built (deploy only) | **assemble + deploy**          |
| VisibilityAI                      |           ~14           |   0 (security hardening)   |         customer UI         | **assemble + secure + deploy** |
| Review Mgmt / Reputation Recovery |           ~11           |             0              |           thin UI           | **thin wrap**                  |
| SalonAI                           |           ~13           |             0              |      full vertical app      | **compose a vertical**         |
| TransportationAI                  |           ~11           |         1 (route)          |             app             | **compose + 1 engine**         |
| ReceptionAI                       |           ~10           | 1 (receptionist+telephony) |             app             | **compose + 1 engine**         |

**Conclusion:** for the top five commercial candidates, **0 platform rebuilds** are required.
The Factory thesis holds — new revenue is a matter of _assembly + deployment + commercial
terms_, governed by the Gap Register and the duplicate-risk check so it stays that way.
