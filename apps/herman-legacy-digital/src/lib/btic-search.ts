/**
 * BTIC search & filter — bounded, in-memory, over a single seeded dossier.
 *
 * V1 scope: this is NOT full-text search over a corpus. It is a small, typed
 * filter across the six entities of one dossier so an executive can find a
 * report, decision, phase, artifact or intelligence record by keyword or facet.
 * Pure functions only — no I/O, unit-tested.
 */

import type { Dossier } from "./btic-data";

export type BticEntity = "phase" | "report" | "decision" | "artifact" | "intelligence";

export interface SearchHit {
  entity: BticEntity;
  id: string;
  title: string;
  snippet: string;
  /** A facet label for filtering (status, category, kind, …). */
  facet: string;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function matches(haystack: string[], q: string): boolean {
  if (!q) return true;
  const needle = norm(q);
  return haystack.some((h) => norm(h).includes(needle));
}

/**
 * Search the dossier. `query` is a free-text keyword (bounded to what is present
 * in the seeded records); `entity` optionally restricts to one entity type.
 * Returns a stable, ordered list of hits.
 */
export function searchDossier(
  d: Dossier,
  query: string,
  entity?: BticEntity,
): SearchHit[] {
  const q = (query ?? "").slice(0, 120); // bound the input length
  const hits: SearchHit[] = [];

  if (!entity || entity === "phase") {
    for (const p of d.phases) {
      if (matches([p.name, p.summary, p.status], q)) {
        hits.push({
          entity: "phase",
          id: p.id,
          title: p.name,
          snippet: p.summary,
          facet: p.status,
        });
      }
    }
  }
  if (!entity || entity === "report") {
    for (const r of d.reports) {
      if (matches([r.title, r.summary, r.subject, r.status, r.version], q)) {
        hits.push({
          entity: "report",
          id: r.id,
          title: r.title,
          snippet: r.summary,
          facet: r.status,
        });
      }
    }
  }
  if (!entity || entity === "decision") {
    for (const x of d.decisions) {
      if (matches([x.question, x.detail, x.blocks, x.status], q)) {
        hits.push({
          entity: "decision",
          id: x.id,
          title: x.question,
          snippet: x.detail,
          facet: x.status,
        });
      }
    }
  }
  if (!entity || entity === "artifact") {
    for (const a of d.artifacts) {
      if (matches([a.title, a.summary, a.reference, a.kind, a.status], q)) {
        hits.push({
          entity: "artifact",
          id: a.id,
          title: a.title,
          snippet: a.summary,
          facet: a.kind,
        });
      }
    }
  }
  if (!entity || entity === "intelligence") {
    for (const i of d.intelligence) {
      if (matches([i.headline, i.detail, i.category, i.confidence], q)) {
        hits.push({
          entity: "intelligence",
          id: i.id,
          title: i.headline,
          snippet: i.detail,
          facet: i.confidence,
        });
      }
    }
  }

  return hits;
}
