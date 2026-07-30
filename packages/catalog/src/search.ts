/**
 * Executive global search.
 *
 * Matches a free-text query against an asset's name, id, summary, tags, owner
 * and kind, and — importantly — surfaces the asset's related assets so a search
 * for "Stripe" or "Notification" returns not just the hit but everything that
 * depends on or provides it.
 */

import type { Asset, Catalog } from "./types";
import { neighborhood } from "./graph";

export interface SearchHit {
  asset: Asset;
  score: number;
  /** Ids of assets directly related to the hit (in or out). */
  related: string[];
}

function haystack(a: Asset): string {
  return [
    a.name,
    a.id,
    a.summary,
    a.owner,
    a.kind,
    a.layer,
    ...(a.tags ?? []),
    ...a.relationships.map((r) => r.to),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Rank assets against `query`. An empty query returns nothing (the UI shows the
 * browse view instead). Scoring favours name/id/tag hits over body hits.
 */
export function search(catalog: Catalog, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const hits: SearchHit[] = [];
  for (const a of catalog.assets) {
    const name = a.name.toLowerCase();
    const id = a.id.toLowerCase();
    const tags = (a.tags ?? []).map((t) => t.toLowerCase());
    const body = haystack(a);

    let score = 0;
    for (const term of terms) {
      if (!body.includes(term)) {
        score = 0;
        break; // every term must match somewhere (AND semantics)
      }
      if (name === term) score += 12;
      else if (name.includes(term)) score += 6;
      if (id.includes(term)) score += 3;
      if (tags.some((t) => t.includes(term))) score += 4;
      score += 1; // body match
    }

    if (score > 0) {
      const n = neighborhood(catalog, a.id);
      const related = [
        ...n.outgoing.map((r) => r.to),
        ...n.incoming.map((e) => e.from),
      ];
      hits.push({ asset: a, score, related: [...new Set(related)] });
    }
  }

  hits.sort((x, y) => y.score - x.score || x.asset.name.localeCompare(y.asset.name));
  return hits.slice(0, limit);
}
