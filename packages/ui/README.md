# @hl-bos/ui

**The Herman Legacy shared shell.**

The design-system primitives and status vocabulary rendered by **both planes** of
Herman Legacy Cloud — the operator plane (Headquarters) and the hosted cloud
plane — so the two surfaces read as one product rather than two consoles.

## What's here

- **Status vocabulary** — `Health` (`green · yellow · red · unknown`) with its
  `DOT` colors and human `LABEL`s. One set of names for "how is this doing",
  shared so the operator plane and the cloud plane never diverge on what a color
  means. The operator plane _computes_ health; this package owns what it _looks
  like_.
- **Primitives** — `Card`, `Dot`, `Row`, `Empty`. Presentational building blocks
  for the shell.

## Tenant-neutral by design

These components render identically for a Herman Legacy company and for a future
external customer. **Tenant awareness lives in the data they render, never in the
components.** That is what lets the same shell serve first-party tenants now and
external customers later without a redesign.

## Provenance

Extracted from `apps/control-center` (Headquarters) in Herman Legacy Cloud Phase
1, so the console and the future hosted plane share one shell. Headquarters'
behavior is unchanged — it now imports these from here instead of defining them
locally.
