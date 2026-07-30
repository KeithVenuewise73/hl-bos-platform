/**
 * Relationship graph.
 *
 * Every asset carries its outgoing relationships. The incoming edges are
 * derived here so an asset detail view can answer both "what does this use?"
 * and "what uses this?" without the registry having to state each edge twice.
 */

import type { Asset, Catalog, RelationKind, Relationship } from "./types";
import { INVERSE_RELATION } from "./types";

export interface IncomingEdge {
  kind: RelationKind;
  /** Natural-language inverse, e.g. "used by". */
  inverseLabel: string;
  /** The asset id on the other (source) end. */
  from: string;
}

export interface Neighborhood {
  outgoing: Relationship[];
  incoming: IncomingEdge[];
}

export function assetById(catalog: Catalog, id: string): Asset | undefined {
  return catalog.assets.find((a) => a.id === id);
}

export function neighborhood(catalog: Catalog, id: string): Neighborhood {
  const outgoing = assetById(catalog, id)?.relationships ?? [];
  const incoming: IncomingEdge[] = [];
  for (const a of catalog.assets) {
    if (a.id === id) continue;
    for (const r of a.relationships) {
      if (r.to === id) {
        incoming.push({
          kind: r.kind,
          inverseLabel: INVERSE_RELATION[r.kind],
          from: a.id,
        });
      }
    }
  }
  return { outgoing, incoming };
}

/**
 * Every asset id referenced by a relationship. Used by the integrity test to
 * prove there are no dangling edges in the registry.
 */
export function referencedIds(catalog: Catalog): Set<string> {
  const ids = new Set<string>();
  for (const a of catalog.assets) {
    for (const r of a.relationships) ids.add(r.to);
  }
  return ids;
}
