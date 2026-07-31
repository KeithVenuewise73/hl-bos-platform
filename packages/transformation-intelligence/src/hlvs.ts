/**
 * HLVS integration — software opportunity intelligence.
 *
 * The transformation recommendations already name the Herman Legacy product/
 * service each one needs. This module rolls those up into a distinct view: which
 * SOFTWARE opportunities the assessment implies, deduplicated by product, each
 * with its Software Factory reuse picture and a deterministic build verdict. It
 * is the bridge from "this customer needs X" to "the Factory can assemble or
 * build X, reusing N%."
 */

import type { BuildEffort } from "./factory";
import type { ProductComposition } from "@hl-bos/catalog";
import type { TransformationRecommendation } from "./recommendations";

export type OpportunityVerdict =
  "assemble_now" | "assemble_with_gaps" | "greenfield_build" | "reuse_spine";

export interface SoftwareOpportunity {
  key: string;
  service: string;
  matchedProductKey: string | null;
  matchedProductName: string | null;
  reusePct: number | null;
  missingModules: string[];
  buildEffort: BuildEffort;
  commercialAvailability:
    ProductComposition["commercial"]["commercialAvailability"] | null;
  /** Recommendation ids that surfaced this opportunity. */
  fromRecommendations: string[];
  verdict: OpportunityVerdict;
  note: string;
}

function verdictFor(
  matched: boolean,
  assemblable: boolean,
  effort: BuildEffort,
): OpportunityVerdict {
  if (!matched) return effort === "new_build" ? "greenfield_build" : "reuse_spine";
  return assemblable ? "assemble_now" : "assemble_with_gaps";
}

/** Roll recommendations up into deduplicated software opportunities. */
export function softwareOpportunities(
  recs: TransformationRecommendation[],
): SoftwareOpportunity[] {
  const byKey = new Map<string, SoftwareOpportunity>();

  for (const rec of recs) {
    const f = rec.reusableProduct.factory;
    const service =
      rec.reusableProduct.services[0] ?? "Business Transformation Services";
    const key = f.matchedProductKey ?? `service:${service.toLowerCase()}`;

    const existing = byKey.get(key);
    if (existing) {
      existing.fromRecommendations.push(rec.id);
      continue;
    }

    byKey.set(key, {
      key,
      service,
      matchedProductKey: f.matchedProductKey,
      matchedProductName: f.matchedProductName,
      reusePct: f.reusePct,
      missingModules: f.missingModules,
      buildEffort: f.buildEffort,
      commercialAvailability: f.commercialAvailability,
      fromRecommendations: [rec.id],
      verdict: verdictFor(f.matchedProductKey !== null, f.assemblable, f.buildEffort),
      note: f.note,
    });
  }

  // Deterministic order: assemble-now first, then by reuse desc, then key.
  const rank: Record<OpportunityVerdict, number> = {
    assemble_now: 0,
    assemble_with_gaps: 1,
    reuse_spine: 2,
    greenfield_build: 3,
  };
  return [...byKey.values()].sort((a, b) => {
    const r = rank[a.verdict] - rank[b.verdict];
    if (r !== 0) return r;
    const ra = a.reusePct ?? -1;
    const rb = b.reusePct ?? -1;
    if (rb !== ra) return rb - ra;
    return a.key.localeCompare(b.key);
  });
}
