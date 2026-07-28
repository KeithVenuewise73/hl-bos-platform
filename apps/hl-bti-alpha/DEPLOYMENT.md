# HL-BTI — Deployment Status & Missing Infrastructure

_Written in response to the Deployment Stop Order. Plain English, honest, no jargon chores for the CEO._

## Bottom line, up front

**You can use the core product in a browser right now** — no install, no login, no terminal:

> **Live preview:** https://claude.ai/code/artifact/3e064977-1e37-4d61-aa3b-e4b84d472fcd

Open that link on any device. It runs the **real HL-BTI engine** in your browser and walks the whole workflow:
**enter a business → run an analysis → view evidence-backed findings → generate an Executive Blueprint → generate a Proposal → export/print.**

**What that preview does _not_ do yet — and I will not pretend otherwise:** it has **no sign-in**, and it does **not save** your work to the Herman Legacy cloud or share it across devices. Those two things — _login_ and _saved, cross-device engagements_ — need infrastructure that does not exist yet and app code that is not built yet. So I am **not reporting the full deployment as complete.** The order said: if deployment cannot be completed because infrastructure is missing, stop and identify exactly what is missing. That is what the rest of this page does.

---

## What works today, step by step (your Definition of Done)

Using the preview link above, in a browser:

| Order requirement    | In the preview? | Notes                                                                                |
| -------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Open the application | ✅ Yes          | The link opens on any device.                                                        |
| Log in               | ❌ **No**       | No accounts exist yet. See "The gap" below.                                          |
| Create a business    | ✅ Yes          | Type name, website, industry, location.                                              |
| Run an analysis      | ✅ Yes          | Real signals read from the page; you enter no scores.                                |
| View findings        | ✅ Yes          | Each with evidence, impact, risk, root cause, Herman Legacy solution, priority, ROI. |
| Generate a Blueprint | ✅ Yes          | Executive Business Transformation Blueprint, assembled automatically.                |
| Generate a Proposal  | ✅ Yes          | One line per Herman Legacy product; you set the price.                               |

**Six of the seven steps work in a browser today.** The one that does not — **Log in** — is blocked, honestly, by the items below.

---

## The gap: why "Log in" and "saved work" are not there yet

Two separate things are missing. Both are real; neither is hidden.

1. **The app has no sign-in or database code yet.** The current HL-BTI app (`apps/hl-bti-alpha`) is a _static_ app: it runs entirely in the browser and keeps data only on that one device. It contains **no login screen and no connection to Supabase.** That is engineering work I own and can do — but it is not built, so I will not claim it exists.

2. **The cloud infrastructure to run a logged-in, saved version is not provisioned.** Even with the code, a real deployment needs a place to host it, a database to connect to, a way to log in, and a web address. Those pieces are listed next.

---

## Exactly what infrastructure is missing

This is the precise list the order asked for. "Who provides it" separates **your decisions** (things only you can authorize) from **my work** (engineering I do once you authorize).

| #   | What's missing                                                        | Status today                                                                                                                                                                        | Who provides it                                                                                                    |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | **Application hosting** — a place on the web to run the app           | Not chosen. The deploy pipeline (`.github/workflows/deploy.yml`) states plainly: _"Frontend/worker application hosting is NOT chosen yet."_                                         | **Your decision** — pick a host (I recommend one below) and authorize an account. Then **my work**.                |
| 2   | **Sign-in (authentication)** — accounts, login, passwords             | No login code in the app.                                                                                                                                                           | **My work** — build it on Supabase Auth (already available in the Pro project).                                    |
| 3   | **Database connection to the Herman Legacy Supabase Pro project**     | The app is not wired to any database. The HL-BTI database design (`supabase/migrations/…hlbos_0026_bti_platform.sql`) is written and tested but **not yet applied** to the project. | **My work** to wire it; **your approval** to apply the database change (see decisions).                            |
| 4   | **The web address (domain + DNS)** — e.g. `platform.hermanlegacy.com` | No Herman Legacy domain is connected to this project, and I have no access to your DNS.                                                                                             | **Your decision** — tell me the domain and grant DNS access (or point it yourself, one setting). Then **my work**. |
| 5   | **Production release approval in the pipeline**                       | The automated release step is intentionally locked behind a `production` approval gate that has no approver and no keys set.                                                        | **Your decision** — one-time authorization; then **my work** to arm it.                                            |

None of these require you to open a terminal or run a command. Each is either a **trust decision only you can make**, or **engineering I do once you've made it.**

---

## The decisions only you can make (the legitimate exceptions)

Per our operating contract, the only things I hand to you are decisions about **trust and access** — never engineering chores. There are four, and here is exactly what each one unlocks:

1. **Choose a host and authorize it.**
   My recommendation: **Vercel** — it is built for exactly this kind of app, deploys in minutes, includes HTTPS, and connects cleanly to Supabase. Authorizing a Vercel account (free tier is enough to start) unlocks items **#1 and #5**.
   _Alternative:_ if you prefer to keep everything inside Supabase, I can deploy the app on Supabase hosting instead — tell me and I'll adjust.

2. **Approve connecting to the Herman Legacy Supabase Pro project, and approve applying the database design.**
   This creates the tables that store businesses, analyses, blueprints, and proposals. Nothing is applied to any database without this explicit approval — that is a standing rule. This unlocks items **#2 and #3**.

3. **Name the web address and grant DNS access (or point it yourself).**
   Tell me the domain you want (e.g. `platform.hermanlegacy.com`). Either give me access to the domain's DNS settings, or I'll hand you the _one_ value to paste into your domain provider. This unlocks item **#4**.

4. **Authorize the production release gate.**
   A one-time approval so the automated pipeline is allowed to publish to the live address. This arms item **#5**.

Ask me and I will walk each one down to the single click or single value it requires — no command line, ever.

---

## What I do the moment you authorize the above

This is my work, not yours. In order:

1. Build **sign-in** into the app (Supabase Auth) — a real login screen and accounts, with your CEO account first.
2. Wire the app to the **Herman Legacy Supabase Pro project** so every business, analysis, blueprint, and proposal is **saved and available on any device.**
3. Apply the **HL-BTI database design** to the Pro project (only after your approval), and verify it with the existing test suite.
4. Deploy the app to the **chosen host**, connect the **domain**, and confirm **HTTPS**.
5. Create your **login credentials** and hand them to you privately.
6. **Prove it end to end in a browser** — open the live address, log in, create a business, run an analysis, view findings, generate a blueprint, generate a proposal — and only then report the deployment complete, with the exact URL.

Until every one of those is done and proven, the honest status is: **the core workflow is usable at the preview link above; the full, logged-in, saved cloud deployment is blocked on the decisions in this document.**

---

## One question, plainly

To move from "usable preview" to "your live, logged-in platform," I need one thing from you to start: **which host** — Vercel (my recommendation) or Supabase — and your go-ahead to **connect the Supabase Pro project**. Say the word and I begin the build; each access step I'll bring to you as a single, explained click.
