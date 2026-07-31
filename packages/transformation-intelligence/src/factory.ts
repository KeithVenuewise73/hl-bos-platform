/**
 * Software Factory integration.
 *
 * When a recommendation points at a Herman Legacy product, this adapter asks the
 * REAL Software Factory (via @hl-bos/catalog) what it would take to deliver it:
 * how much is already built (reuse %), which modules are missing, the build
 * effort, and the honest commercial availability. It computes nothing itself —
 * it drives `assembleProduct` over the registered module registry and reports
 * what is counted, never asserted.
 */

import {
  compositionByKey,
  assembleProduct,
  sharedSpineOf,
  PRODUCT_COMPOSITIONS,
  type ProductComposition,
} from "@hl-bos/catalog";

export type BuildEffort = "low" | "medium" | "high" | "new_build";

export interface FactoryReuse {
  /** The matched product composition key, or null if the service maps to no product. */
  matchedProductKey: string | null;
  matchedProductName: string | null;
  /** Foundation readiness % from the assembler (share of required modules built). */
  reusePct: number | null;
  requiredCount: number | null;
  builtCount: number | null;
  sharedSpineCount: number | null;
  missingModules: string[];
  assemblable: boolean;
  buildEffort: BuildEffort;
  /** Honest commercial availability from the composition (pricing stays pending-CEO). */
  commercialAvailability:
    ProductComposition["commercial"]["commercialAvailability"] | null;
  note: string;
}

/**
 * Normalised substring → product key. A recommendation's HL service/product name
 * is matched case-insensitively against these fragments. Data, not branching:
 * a new mapping is a row.
 */
const SERVICE_TO_PRODUCT: Array<{ match: string; product: string }> = [
  { match: "reputation", product: "reputation_recovery" },
  { match: "review", product: "review_management" },
  { match: "visibility", product: "visibility_ai" },
  { match: "transformation", product: "hl_bti" },
  { match: "business transformation", product: "hl_bti" },
  { match: "bti", product: "hl_bti" },
  { match: "salon", product: "salon_ai" },
  { match: "reception", product: "reception_ai" },
  { match: "transportation", product: "transportation_ai" },
  { match: "homehuddle", product: "home_huddle" },
];

/** The shared spine every new vertical inherits — the platform reuse dividend. */
export function sharedSpineSize(): number {
  // Every composition draws from the same COMMON_SPINE; measure it from one.
  const anchor = PRODUCT_COMPOSITIONS[0];
  return anchor ? sharedSpineOf(anchor).length : 0;
}

/** Resolve a product composition key to a full FactoryReuse via the assembler. */
export function factoryReuseForProductKey(productKey: string): FactoryReuse {
  const comp = compositionByKey(productKey);
  if (!comp) return unmatchedReuse(`No registered composition for "${productKey}".`);
  const asm = assembleProduct(comp);
  const missing = asm.missingModules.length;
  const effort: BuildEffort = asm.assemblable
    ? "low"
    : missing <= 2
      ? "medium"
      : "high";
  return {
    matchedProductKey: comp.productKey,
    matchedProductName: comp.name,
    reusePct: asm.foundationReadinessPct,
    requiredCount: asm.requiredCount,
    builtCount: asm.builtCount,
    sharedSpineCount: asm.sharedSpineCount,
    missingModules: asm.missingModules,
    assemblable: asm.assemblable,
    buildEffort: effort,
    commercialAvailability: comp.commercial.commercialAvailability,
    note: asm.assemblable
      ? `Assemblable now: ${asm.builtCount}/${asm.requiredCount} modules built (${asm.sharedSpineCount} from the shared spine).`
      : `${missing} module(s) missing: ${asm.missingModules.join(", ")}.`,
  };
}

/** Map a recommendation's HL service/product name to its Factory reuse picture. */
export function factoryReuseForService(service: string): FactoryReuse {
  const hay = service.toLowerCase();
  const hit = SERVICE_TO_PRODUCT.find((r) => hay.includes(r.match));
  if (!hit) {
    return unmatchedReuse(
      `"${service}" maps to no single product; ${sharedSpineSize()} shared-spine modules remain reusable for a net-new build.`,
    );
  }
  return factoryReuseForProductKey(hit.product);
}

function unmatchedReuse(note: string): FactoryReuse {
  return {
    matchedProductKey: null,
    matchedProductName: null,
    reusePct: null,
    requiredCount: null,
    builtCount: null,
    sharedSpineCount: sharedSpineSize(),
    missingModules: [],
    assemblable: false,
    buildEffort: "new_build",
    commercialAvailability: null,
    note,
  };
}
