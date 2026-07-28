// @hl-bos/bti-engine — the canonical, deterministic HL-BTI engine shared by the
// Alpha UI and mirrored by the DB authority (bti.*) and the edge layer
// (_shared/bti). One algorithm, asserted to the same fixture everywhere.

export * from "./types.ts";
export * from "./catalog.ts";
export * from "./scoring.ts";
export * from "./lifecycle.ts";
export * from "./growth.ts";
export * from "./blueprint.ts";

// Convenience: the domain transformation weights, straight from the catalog.
import { DOMAINS } from "./catalog.ts";
import type { DomainWeight } from "./scoring.ts";

export const DOMAIN_WEIGHTS: DomainWeight[] = DOMAINS.map((d) => ({
  domain: d.key,
  transformationWeight: d.transformationWeight,
}));
