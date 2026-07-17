# @hl-bos/deploy

**Provider-agnostic deployment abstraction for Herman Legacy Cloud.**

Headquarters and the vertical applications deploy _through_ Herman Legacy Cloud.
The hosting provider is a swappable adapter behind one interface — never a hard
dependency. This package is the contract that makes that true.

## Why it exists (Decision 4)

HLC must not be bound to a single hosting provider. We may start on a commercial
cloud, but the architecture has to allow migration to Herman-Legacy-managed
infrastructure **without redesigning Headquarters or the applications.**

The guarantee: callers depend on `DeploymentService` and the types in this
package — never on a provider's SDK. Changing infrastructure is a new
`DeploymentProvider` implementation plus a configuration change. No caller
changes.

## The seam

```
Headquarters (operator plane) ─┐
Vertical apps (per tenant) ────┼──▶ DeploymentService ──▶ DeploymentProvider
                               ┘        (this package)        ├─ vercel
                                                              ├─ netlify
                                                              ├─ cloudflare
                                                              └─ hl-managed   ◀── added later, nothing above changes
```

- **`DeploymentProvider`** — the interface each host implements: create, get,
  list, promote, rollback, logs, destroy, plus a `capabilities` descriptor.
- **`ProviderRegistry`** — the adapters available to this deployment. Built once
  by the cloud plane from configuration.
- **`ProviderResolver`** — `(target) => providerKey`. Chooses the provider for a
  target from platform config. This is where "commercial now, HL-managed later"
  is a data change, not a rewrite.
- **`DeploymentService`** — the single entry point callers use. Resolves the
  provider for a target and delegates. Owns no provider logic.
- **`DisconnectedProvider`** — the honest default. Implements the whole contract
  and reports `not-configured` for every operation. It never fakes a success, so
  HLC can exist before any host is wired.

## Capabilities, not assumptions

`ProviderCapabilities` lets the cloud plane adapt to what a provider can actually
do (preview environments, instant rollback, self-hosted, selectable regions)
rather than assuming a commercial host's feature set. When we move to
HL-managed infrastructure, its adapter declares its own capabilities and the UI
follows — it does not pretend to have features the platform lacks, and it is not
capped to features a prior host happened to have.

## Secrets never pass through here

An `EnvVarBinding` references a secret by its **vault key**. The secret value
lives in Supabase Vault and is resolved by the provider adapter at deploy time.
No credential is ever an argument to this package.

## What this package is not

It performs no real deployments yet — only the `DisconnectedProvider` ships.
Real adapters (a commercial host first, then `hl-managed`) are added in later
phases, each behind this same interface, each with its own tests. Adding one
does not touch Headquarters or any application.

## Status

Interface, registry, service and the honest default provider — with tests. No
network calls, no provider SDKs, no side effects. Part of Herman Legacy Cloud,
Phase 1.
