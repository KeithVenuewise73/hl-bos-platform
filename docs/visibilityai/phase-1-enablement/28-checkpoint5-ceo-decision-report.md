# Phase 1 · Deliverable 11 (CP5) — CEO Decision & Authorization Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · One page of decisions, in plain language. No engineering required to read or act on this.

## What was built (and proven)

The **Website Assessment Collector** — the first working module of the Business Discovery Engine — now exists as tested software:

- It can take a business's website URL, safely fetch the page, and extract **structured facts** about the site (security, SEO, mobile-readiness, accessibility, contact/conversion signals, analytics, social presence).
- It turns those facts into **scored maturity dimensions**, each traceable to the exact evidence that produced it — no invented numbers.
- It is **safe by construction**: it refuses to reach internal or private addresses, rejects dangerous redirects, and treats website text as untrusted data that can never hijack the AI.
- Everything it produces flows into the **existing** unified profile, evidence, scoring, and review systems — no duplicate machinery was built.

**Proof:** 315 database tests and 44 edge tests pass, plus all repository quality gates. Real output, not "should work."

## What is deliberately switched OFF

Nothing touches the real world yet. All of the following are **inactive** and await your explicit go-ahead:

- Real crawling of live websites
- Live AI analysis (Anthropic) — currently a safe mock
- Real performance scoring (Google PageSpeed) — currently a mock
- Any automatic/scheduled scanning
- Any customer-facing scan submission

## Decisions for you

These are trust decisions only you control. **None is needed to keep the platform correct today** — they unlock live operation when you choose.

| #   | Decision                                                                       | What it unlocks                                       | Recommended timing                                |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- |
| 1   | Approve applying migrations `0021` + `0022` to the canonical project           | The scan lifecycle exists in production (still inert) | After you've reviewed this checkpoint             |
| 2   | Authorize creating the `anthropic_api_key` Vault secret                        | Live AI interpretation                                | When you want AI narrative on assessments         |
| 3   | Authorize creating the `google_pagespeed_api_key` Vault secret                 | Real performance metrics                              | When performance scoring matters to a customer    |
| 4   | Authorize deploying the worker **with the connect-time IP safeguard reviewed** | Actual crawling of real sites                         | Only after engineering demonstrates the safeguard |
| 5   | Authorize the automatic scan scheduler                                         | Hands-off processing of scan requests                 | After a manual scan proves out end-to-end         |

**Engineering recommendation:** approve #1 now (safe — the code is inert and fully tested); hold #2–#5 until the next checkpoint demonstrates a single, manually-triggered end-to-end scan against a consenting test site with the IP safeguard in place. Decision #4 is the one that must not be rushed — see the [SSRF & Crawl Security Report](21-ssrf-and-crawl-security.md) and [Known Limitations](27-known-limitations.md).

## The one thing to remember

The collector will never invent a finding or a score. If it cannot measure something, it says so. That honesty is enforced in code and in tests, and it is the foundation the customer-facing assessment will be built on.
