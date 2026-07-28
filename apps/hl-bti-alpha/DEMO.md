# HL-BTI — Live Demonstration Instructions (EO-001)

The complete customer workflow — **enter a business → Analyze → findings → Herman Legacy recommendations → Executive Blueprint → Proposal** — runs end to end in HL-BTI Alpha. This is a working, demonstrable build.

## Run it

```bash
# from the repo root
pnpm --filter @hl-bos/hl-bti-alpha dev      # opens on http://localhost:4100
```

or serve the production build (static, no server needed):

```bash
pnpm --filter @hl-bos/hl-bti-alpha build     # emits apps/hl-bti-alpha/out
# then serve apps/hl-bti-alpha/out with any static file server
```

The app opens on **Analyze Business** — the front door.

## The demonstration (the CEO Definition of Done)

1. **Enter a business.** The form is pre-filled with a demo business (Rivertown Logistics) and its homepage. For a real customer, type their **name, website, industry, location**, expand **"Website content"**, and paste the customer's homepage HTML (or leave the demo site to show the flow).
2. **Click “⚡ Analyze Business.”** HL-BTI shows an analyzing state, then produces the analysis. **You enter no scores.**
3. **Watch it analyze.** HL-BTI reads real signals from the page (HTTPS, title/meta, schema.org, social links, contact/forms, analytics, headings, images) — the evidence is shown under each observation.
4. **Review the Business Intelligence Profile** — HL-BTI's plain-language _understanding_ of the business, each point linked to the evidence behind it. An honesty banner states what a website alone cannot reveal.
5. **Review the findings.** Each finding shows **Evidence · Business Impact · Confidence · Recommended Herman Legacy solution · Priority · Estimated ROI** — exactly the fields the order requires. Nothing is unsupported.
6. **Review the recommended Herman Legacy products** — VisibilityAI, Marketing Services, SEO, Herman Legacy Digital, AI Automation, Reputation Management, Future Vertical Operating Systems — each tied to the findings that justify it.
7. **Read the Executive Business Transformation Blueprint** — assembled automatically (Executive Summary, Current State, Strengths/Weaknesses, Strategic Risks, Opportunities, Transformation Priorities, Recommended Herman Legacy Services, Board Summary).
8. **Present the Proposal** — generated directly from the blueprint, one line per Herman Legacy product, Monthly vs. one-time, each addressing specific findings. Pricing is deliberately blank ("TBD") — HL-BTI never invents a price.
9. **Click “🖨 Export Blueprint + Proposal”** to print / save a PDF to leave with the customer.

## What is real vs. what is honestly bounded

- **Real:** the analysis reads genuine signals from the provided HTML; findings, recommendations, blueprint, and proposal are all produced deterministically from that evidence by orchestrating existing engines (the website extractor + the Consulting Intelligence Framework). No manual scoring. No invented facts.
- **Bounded (state this to the customer):** the analysis is **website-driven**. Operations, financial, and deep AI-readiness findings are marked "needs more evidence" — HL-BTI does not infer what it cannot observe. In a deployed build, the website is fetched automatically and document/interview collectors remove those prompts. In this local build, the consultant supplies the page HTML (paste or the demo site) because a static browser app cannot fetch arbitrary third-party sites directly.

## Proof this build works

- `next build` (static export) compiles + typechecks + emits the app.
- A Chromium run drives the whole flow (enter → Analyze → profile → findings → blueprint → proposal); screenshots captured.
- 81 unit tests pass (8 new for the analyst orchestration + extractor); eslint / typecheck / prettier clean.
