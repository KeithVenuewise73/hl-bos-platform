# HL-BTI — self-contained preview build

`hl-bti-preview.html` is a **single, self-contained HTML file** that runs the
complete HL-BTI **Analyze → Blueprint → Proposal** workflow in any browser with
no server, no install, and no login.

## Why it exists

The Deployment Stop Order required a usable application in a browser today. The
full logged-in cloud deployment is blocked on infrastructure decisions (see
`../DEPLOYMENT.md`). This preview delivers the **core workflow** now while that
infrastructure is authorized.

## What's inside

- The **real** `@hl-bos/bti-engine` analyst + Consulting Intelligence Framework,
  bundled to an IIFE and inlined — so the analysis, findings, blueprint, and
  proposal are produced by the same deterministic engine as the app. Nothing is
  re-implemented or faked, and nothing is invented.
- A vanilla-JS, theme-aware UI that mirrors `src/screens/Analyze.tsx`.

## What it deliberately does NOT include

- **Sign-in** and **saved, cross-device engagements.** Those require Supabase
  Auth wiring and the cloud infrastructure described in `../DEPLOYMENT.md`.

## How it was produced

1. Bundle the engine entry (exposing `analyst.analyzeBusiness`, the sample
   business/HTML, and `INDUSTRY_PACKS` on `window.HLBTI`) with esbuild:
   `esbuild entry.ts --bundle --format=iife --target=es2020 --minify`.
2. Inline that bundle into the UI template's `<script id="engine">`.

It is a generated artifact, checked in so the deliverable survives an ephemeral
build environment. Regenerate it whenever the engine changes.
