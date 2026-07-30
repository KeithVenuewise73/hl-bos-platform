/**
 * Catalog completeness.
 *
 * For the asset kinds that map to something physically on disk, completeness is
 * measured — never asserted. It is the share of *discovered* objects that are
 * *registered* in the catalog. If someone adds a schema or an edge function
 * without registering it, completeness for that kind drops below 100% and the
 * unregistered object is named. That is the governance signal.
 *
 * Curated kinds (business capabilities, industry solutions, workflows, APIs,
 * modules, products) have no filesystem denominator and are reported as counts,
 * not percentages — we do not fabricate a "100%" we cannot verify.
 */

import type { Asset, AssetKind, Catalog } from "./types";
import type { DiscoveredInventory } from "./scan";

export interface KindCompleteness {
  kind: AssetKind;
  label: string;
  discovered: number;
  registered: number;
  /** Registered assets whose key matches something discovered. */
  matched: number;
  /** Discovered keys with no registered asset — the governance backlog. */
  unregistered: string[];
  pct: number;
}

export interface CompletenessReport {
  byKind: KindCompleteness[];
  overallDiscovered: number;
  overallMatched: number;
  overallPct: number;
}

/** The asset kinds that can be reconciled against a filesystem scan. */
const DISCOVERABLE: Array<{
  kind: AssetKind;
  label: string;
  discovered: (inv: DiscoveredInventory) => string[];
}> = [
  { kind: "database", label: "Databases (schemas)", discovered: (i) => i.schemas },
  {
    kind: "edge_function",
    label: "Edge Functions",
    discovered: (i) => i.edgeFunctions,
  },
  { kind: "application", label: "Applications", discovered: (i) => i.apps },
  { kind: "package", label: "Shared Packages", discovered: (i) => i.packages },
];

function keysFor(catalog: Catalog, kind: AssetKind): Set<string> {
  const keys = new Set<string>();
  for (const a of catalog.assets) {
    if (a.kind === kind && a.key) keys.add(a.key);
  }
  return keys;
}

function countOf(catalog: Catalog, kind: AssetKind): number {
  return catalog.assets.filter((a: Asset) => a.kind === kind).length;
}

export function completeness(
  catalog: Catalog,
  inv: DiscoveredInventory,
): CompletenessReport {
  const byKind: KindCompleteness[] = [];
  let overallDiscovered = 0;
  let overallMatched = 0;

  for (const spec of DISCOVERABLE) {
    const discovered = spec.discovered(inv);
    const registeredKeys = keysFor(catalog, spec.kind);
    const matched = discovered.filter((d) => registeredKeys.has(d));
    const unregistered = discovered.filter((d) => !registeredKeys.has(d));
    const pct =
      discovered.length === 0
        ? 100
        : Math.round((matched.length / discovered.length) * 100);

    byKind.push({
      kind: spec.kind,
      label: spec.label,
      discovered: discovered.length,
      registered: countOf(catalog, spec.kind),
      matched: matched.length,
      unregistered,
      pct,
    });

    overallDiscovered += discovered.length;
    overallMatched += matched.length;
  }

  return {
    byKind,
    overallDiscovered,
    overallMatched,
    overallPct:
      overallDiscovered === 0
        ? 100
        : Math.round((overallMatched / overallDiscovered) * 100),
  };
}
