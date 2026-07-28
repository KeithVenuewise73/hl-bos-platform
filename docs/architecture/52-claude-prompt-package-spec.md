# CP8 · Deliverable 8 — Claude Prompt-Package Specification

**Date:** 2026-07-27 · **Checkpoint:** 8 · `hlvs.prompt_packages` + `_shared/hlvs/prompt.ts`

A deterministic prompt-package generator turns an **approved** Software Creation Order into a complete, versioned development package for Claude — generated and exported, but **never submitted automatically**.

## Contents

Architectural context; product objective; mandatory reuse-analysis requirement; exact scope (reuse/configure/extend/adapters/new-authorized/required); prohibited duplication; excluded work; repository + branch restrictions; Supabase + HL-BOS requirements; checkpoint instructions; test requirements; required documentation; human-review gates; live-production restrictions; and the required completion-report format (`hlvs.checkpoint_report.v1`). `live_execution` is always `false`.

## Exports

Three formats, all stored on the row: `text_export`, `markdown_export`, `json_export`. The TS generator (`generatePromptPackage`, `hlvs-prompt-0.1.0`) is deterministic (same order → same package) and produces all three.

## Generation gate + versioning

`hlvs.generate_prompt_package(order)` requires the order status to be `approved` (else `22023`; `t_prompt_requires_approved_order`), writes the next version (`t_prompt_versioned`), advances the order to `prompt_generated`, and emits `hlvs.prompt_package.generated`. `hlvs.order.manage` required.

## The generator must not

Invent prices; invent customer acceptance; invent architecture approvals; select an AI provider without policy authorization; authorize production; expose secrets; modify source code; or call Claude automatically. The TS generator **refuses to emit a package containing a secret** (`prompt: refuses to generate if a secret is present`), and `live_execution` is fixed to `false` (`t_prompt_no_live_execution`).
