# @hl-bos/cloud — Herman Legacy Cloud

**The hosted execution plane of Headquarters.**

Headquarters has two planes that share one codebase and one identity. The
operator plane (`apps/control-center`) runs locally and is allowed to touch the
toolchain. This — the cloud plane — is **hosted**, and therefore exposes **only
operations that are safe to perform remotely.**

## The remote-safety boundary (enforced, not just intended)

- It **shells out to nothing** and holds **no `service_role`**; it acts through
  RLS and authenticated APIs.
- The ESLint config forbids `apps/cloud` from importing `child_process` or any
  operator-plane module — a shell-out import fails the lint, so the boundary
  can't erode by accident.
- Anything requiring shell execution, OS access or elevated privilege stays in
  the operator plane, unless it is deliberately promoted behind an
  authenticated, authorized API. The `@hl-bos/lifecycle` model records which
  plane every company action runs on.

## What it shows today

Read-only, and honest about it:

- **Companies** — the tenants. Empty until the platform tenant tables are
  applied; Herman Legacy companies will be the first, external customers use the
  same path.
- **Company lifecycle** — provision → operate → monitor → update → back up →
  retire, each action tagged with its plane (from `@hl-bos/lifecycle`).
- **Deployments** — provider-agnostic via `@hl-bos/deploy`; no host connected
  yet, so it says so rather than pretending.

## Run

```bash
pnpm --filter @hl-bos/cloud dev     # http://localhost:4100
```
