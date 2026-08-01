# Herman Legacy Digital · Release 1 — CEO Review Build

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-08-01
**Purpose:** Let you experience Herman Legacy Digital exactly as a future customer would — from
real screenshots and real system behavior — and decide whether it is ready to deploy. This phase
added **no features**. It observed and documented what the built app actually does.

> **Honesty note up front.** Every screenshot in `screenshots/` is a render of the real running
> application, not a mockup. Every "no data" panel you'll see is the app telling the truth, not a
> gap I papered over. Where something genuinely cannot be shown yet, this document says so and says
> why.

---

## 1. CEO walkthrough — what you are looking at

Open the screenshots in `docs/products/herman-legacy-digital/release-1/screenshots/` in order.
Here is what each one is, in plain language.

1. **Home** (`01-home.png`) — The front door. Your positioning ("AI-powered Business
   Transformation"), the 8-step methodology, the three focus markets (Logistics, Service, Sports),
   and the calls to action. This is the first thing a prospect sees.
2. **About** (`02-about.png`) — Who Herman Legacy Digital is and the promise it makes.
3. **How We Transform** (`03-how-we-transform.png`) — The full HL-BTI methodology, laid out as a
   customer would follow it. This is the same transformation engine that runs internally, presented
   publicly.
4. **Solutions** (`04-solutions.png`) — Your product portfolio, grouped by category. This is a
   **public projection**: it shows what each solution does for a customer and deliberately hides the
   internal metrics (maturity scores, cost, effort) that belong to you, not to the public.
5. **Industries** (`05-industries.png`) — The same portfolio, cut by the three markets, so a
   logistics prospect sees logistics solutions first.
6. **Visibility Assessment** (`06-visibility-assessment.png`) — The front door to a paying
   relationship. A prospect describes their business and requests an assessment. **It never claims
   an AI assessment has already run** — it captures a request that a Herman Legacy advisor confirms.
7. **Marketing & Growth** (`07-marketing-growth.png`) — The Herman Legacy Marketing offering
   (built in Phase 3A), presented as a service.
8. **Innovation Marketplace** (`08-innovation-marketplace.png`) — The public introduction to
   additional capabilities. Again a public projection — no internal metrics, no prices that would
   undercut a professional recommendation.
9. **Resources** (`09-resources.png`) — Reference implementations (your own businesses, from Phase
   4), labeled honestly as _internal reference implementation_ / _baseline pending_. No unverified
   case-study claims.
10. **Client Login** (`10-client-login.png`) — The sign-in for existing clients, on HL-BOS identity
    (the same identity system the rest of the platform uses — not a new one).
11. **Client Portal** (`11-client-portal.png`) — What a signed-in client sees: their engagement,
    roadmap, documents, recommendations, and a portal marketplace. **This is where honesty is most
    visible** — every section that has no real data yet says "no data yet" and why, rather than
    showing a fake number.
12. **Book an Assessment** (`12-book-assessment.png`) — The consultation intake.
13. **Contact** (`13-contact.png`) — How to start a conversation.

**The journey these screenshots tell, end to end:** a visitor lands on Home → reads the
methodology → opens Visibility Assessment → submits a request → that request becomes a lead in the
customer lifecycle → a client signs in → the portal shows their engagement and advisor-set
recommendations → in the portal marketplace they can _request a discussion_ about additional
capabilities, but they can never silently rewrite the plan their advisor set.

---

## 2. Functional walkthrough — proof it actually works

This is not "it should work." These are the real responses the running app returned during this
review, captured live against the local server.

### Navigation

All 13 routes render and are reachable from the site header/footer. Evidence: the 13 screenshots
above, each a successful full-page render of its route (a broken route cannot produce a full-page
screenshot).

### Authentication & portal gating

- `/portal` is gated in middleware; only the `/portal` prefix requires a client identity, the rest
  of the site is public. Evidence: the public routes rendered without a session; the portal
  rendered only because the review server ran with the local dev-client bypass.
- **The dev bypass cannot exist in production.** It is disabled whenever `NODE_ENV` or `HL_BOS_ENV`
  is `production`. In production, `/portal` requires a real HL-BOS Supabase session. (Unit test:
  `src/lib/access.test.ts` asserts the bypass is false in production.)

### Assessment intake — the honest core

Live `POST /api/intake` responses captured this session:

- **Valid submission** →
  `{"status":"received","ref":"HLD-18HTTPO","nextStep":"Your visibility assessment request is in
the queue. A Herman Legacy advisor will confirm scope and run the assessment — you'll be notified
when results are ready.","persisted":false}`
  Note two truths in that one response: the reply is a **request confirmation, never an AI result**,
  and `persisted:false` honestly reports that no live CRM endpoint is wired yet (it's a one-line
  deploy-time env, `HLD_INTAKE_WEBHOOK_URL`). The request is still captured in logs, so nothing is
  lost.
- **Invalid submission** (bad email, no consent) →
  `{"status":"invalid","errors":["A valid email is required.","Consent and privacy acknowledgment
is required."]}`
  Validation is real, not decorative.

### Recommendation flow & marketplace boundary

In the portal, recommendations come from HL-BTI + VisibilityAI (advisor-set). The portal
marketplace shows three groups — _Recommended for your transformation_, _Solutions in use_, and
_Explore additional capabilities_ — and the only action on an "explore" item is **Request a
discussion →**. There is **no "add to plan"** action anywhere. A client cannot replace or silently
edit a professional recommendation; they can only start a conversation. (Unit test:
`src/lib/portal-data.test.ts` asserts `marketplaceBoundaryHolds()` and that no marketplace action
is `add_to_plan`.)

### Analytics events

Live `POST /api/event` responses captured this session:

- **Valid event** (e.g. `assessment_submit`) → `{"ok":true}`, and the server log recorded
  `[event] assessment_submit /visibility-assessment`.
- **Disallowed event** (`revenue`) → **HTTP 422, rejected.** The analytics sink only accepts the 9
  named interaction events; it will not record revenue, ROI, conversions, or customer outcomes,
  because no real outcome data exists yet. Honesty is enforced at the API boundary, not just by
  convention.

---

## 3. Current screenshots

13 real full-page screenshots are in `screenshots/`, indexed in `screenshots/README.md`. They were
captured 2026-08-01 from the running app at 1280×900. Nothing in them is simulated.

---

## 4. What is Implemented / Placeholder / No-data / Deployment-gated

This is the honest state of each capability. Four categories:
**Implemented** = built and working now · **Placeholder** = present as copy/structure, no live
backend behind it yet · **No-data** = built and correctly showing an honest empty state until real
data exists · **Deployment-gated** = built, waiting only on a go-live decision or one env var.

| Capability / surface                        | State                 | Note                                                                           |
| ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| Public site (all 13 routes)                 | **Implemented**       | Renders, navigable, real content                                               |
| Assessment intake validation + confirmation | **Implemented**       | Real validation, honest request-not-result reply                               |
| Intake delivery to CRM                      | **Deployment-gated**  | Works via `HLD_INTAKE_WEBHOOK_URL`; unset → `persisted:false` (still logged)   |
| Analytics event capture                     | **Implemented**       | Accepts 9 named events, rejects disallowed ones (422)                          |
| Analytics forwarding to a sink              | **Deployment-gated**  | Records/logs now; forwarding is a deploy-time env                              |
| Client login (HL-BOS identity)              | **Implemented**       | Real Supabase SSR auth; live sign-in needs deploy env                          |
| Client portal shell                         | **Implemented**       | Renders; gated correctly                                                       |
| Portal engagement / roadmap / documents     | **No-data**           | Honest "no data yet" until a real client engagement exists                     |
| Portal recommendations                      | **Implemented**       | HL-BTI + VisibilityAI, advisor-set                                             |
| Portal marketplace boundary                 | **Implemented**       | "Request a discussion" only; no add-to-plan                                    |
| Solutions / Marketplace public projection   | **Implemented**       | Internal metrics stripped                                                      |
| Reference businesses                        | **No-data / labeled** | "Internal reference implementation" / "baseline pending"; no unverified claims |
| Production deployment + DNS                 | **Deployment-gated**  | Built & validated; awaits your authorization                                   |

**Nothing in the app fabricates data.** The "No-data" rows above are not gaps in honesty — they are
honesty: the app shows an explained empty state instead of a fake number.

---

## 5. Remaining implementation gaps

These are real and worth naming plainly. None of them is a hidden failure; each is a known,
bounded next step.

1. **Live CRM delivery is not wired.** Intake captures every request and logs it, but until
   `HLD_INTAKE_WEBHOOK_URL` points at a real endpoint, requests are not automatically pushed into
   the CRM (`persisted:false` says so). _Bounded: one env var + a receiving endpoint._
2. **Analytics forwarding is not wired.** Events are recorded/logged but not forwarded to an
   analytics store. _Bounded: one env var + a sink._
3. **The portal is empty until real engagements exist.** Everything renders, but roadmap /
   documents / progress show honest no-data states because there is no live client yet. _This is
   expected for a pre-launch app; it fills in as real clients are onboarded._
4. **Reference-business baselines are pending.** Phase 4 classified them measured/estimated/unknown;
   the public "Resources" page reflects that and publishes no unverified case-study claims. _Bounded:
   real baselines get measured before any claim is made public._
5. **No live third-party AI generation providers** (deferred by design from Phase 3A). The Marketing
   & Growth surface is presented as an offering; provider integration awaits your approval.

None of these blocks a deploy. They determine what is _live behind_ the app on day one, not whether
the app can go up.

---

## 6. Deployment readiness confirmation

**The release candidate is built and validated.** For this review it ran cleanly, served every
route, and returned the real API behavior documented in §2.

- **Target safety:** the app is wired only to canonical HL-BOS Core (`mvvtngiopdrgiedjmhfb`). It
  does **not** touch the legacy Venuewise project. Publishable key only — no service-role key is
  read or committed anywhere.
- **Quality gates:** format / lint / typecheck / unit tests / build were the gates run before this
  candidate was committed; this review phase changed **no application code**, only docs and
  screenshots, so the code that was validated is the code you're looking at.
- **Deploy mechanics exist:** standalone Docker build, `/api/health` health check, and the
  step-by-step go-live + DNS sequence are documented in `01-deployment-dns-runbook.md`.
- **Nothing irreversible has been done:** no production deployment, no DNS change. The domain
  (`hermanlegacydigital.com`) is acquired but not pointed anywhere by me.

**Readiness verdict: ready to deploy as a Release 1 candidate.** The gaps in §5 govern what is live
_behind_ it, not whether it can go up.

---

## 7. Recommendation for production deployment

**Recommendation: approve a staged go-live.**

1. **Deploy the app** to Herman Legacy Cloud (Coolify, standalone Docker) **without** pointing DNS
   yet — verify `/api/health` and click through the live URL.
2. **Wire the two env vars** (`HLD_INTAKE_WEBHOOK_URL`, analytics sink) so intake reaches the CRM
   and events are forwarded, then re-verify a real intake round-trips (`persisted:true`).
3. **Point DNS** for `hermanlegacydigital.com` — this is the one irreversible, CEO-authorized step,
   sequenced last in the runbook.
4. **Onboard the first real client** so the portal's no-data states fill with true engagement data.

This ordering lets you see the real thing running before anything public or irreversible happens,
and keeps every honesty guarantee intact on day one.

**Each step above is mine to execute once you authorize it. None of it requires you to open a
terminal or run a command — you approve; I deploy.**

---

_Phase 6A is complete: you can now see what Herman Legacy Digital is, what is operational, what
remains, and whether it is ready. It is ready. The next move is your go/no-go._
