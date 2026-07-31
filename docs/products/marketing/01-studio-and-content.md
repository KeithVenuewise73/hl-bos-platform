# Herman Legacy Marketing · 01 — AI Marketing Studio & Content Manufacturing (Deliverables 3–4)

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
**Implemented as:** `packages/transformation-intelligence/src/{marketing-studio,content-manufacturing}.ts`.

## Deliverable 3 — the AI Marketing Studio (orchestration, providers deferred)

The Studio is **one capability inside Herman Legacy Marketing**. It **orchestrates** best-in-class
AI generation through the existing, metered **AI Gateway** — it never builds foundational
generation models. **No external provider is wired.** Every generation type is declared with
`provider: "deferred"`; the integration point exists, the connection awaits CEO approval.

**Generation capabilities (all routed through `ai.gateway-runtime`, providers deferred):**
Script · Image · Video · Voice · Caption.

**Orchestration integration points** — 4 existing, 1 net-new, 1 deferred:

| Point              | Backing                                            | Status   |
| ------------------ | -------------------------------------------------- | -------- |
| Content scheduling | Scheduling (Venuewise)                             | existing |
| Analytics          | Analytics (Venuewise) + Reporting (BTI dashboards) | existing |
| Approval workflows | Workflows human-approval gate                      | existing |
| Human review       | Workflows tasks + reviewer roles                   | existing |
| Publishing         | Channel connectors                                 | net-new  |
| AI generation      | AI Gateway → external providers                    | deferred |

**Orchestration flow:** Brief → Generate (via Gateway, deferred) → Assemble → **Human review** →
**Approve** → Schedule → **Publish (deferred)** → Measure. Nothing publishes without human review
and approval; publishing and generation both await CEO approval.

## Deliverable 4 — content manufacturing (15 types, one workflow)

All **15** content types run on **one repeatable 10-stage workflow** (review, approval and publish
are gated). Each type declares the generation kinds it needs.

| Content type             | Format      | Channel             | Generation kinds              |
| ------------------------ | ----------- | ------------------- | ----------------------------- |
| TikTok                   | short video | TikTok              | script, video, voice, caption |
| Instagram Reels          | short video | Instagram           | script, video, voice, caption |
| Facebook                 | social post | Facebook            | script, image, caption        |
| YouTube Shorts           | short video | YouTube             | script, video, voice, caption |
| YouTube Long Form        | long video  | YouTube             | script, video, voice, caption |
| LinkedIn                 | social post | LinkedIn            | script, image, caption        |
| Blogs                    | article     | Website / Blog      | script                        |
| Website Content          | web page    | Website             | script                        |
| Landing Pages            | web page    | Website             | script, image                 |
| Email Campaigns          | email       | Email               | script                        |
| Press Releases           | article     | PR / Website        | script                        |
| Customer Success Stories | article     | Website / LinkedIn  | script, image                 |
| Case Studies             | document    | Website / Documents | script, image                 |
| Product Launches         | short video | Multi-channel       | script, image, video, caption |
| Educational Content      | long video  | Multi-channel       | script, image, video          |

**Manufacturing workflow:** Brief → Script gen → Visual gen → Voice gen → Assemble →
**Human review (gated)** → **Approval (gated)** → Schedule → **Publish (gated, deferred)** →
Measure. The same line produces every format; only the generation recipe differs.
