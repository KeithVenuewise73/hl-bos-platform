// Deterministic Factory Build Package readiness engine (HLVS, edge mirror of
// hlvs.evaluate_package_readiness). Returns ready / blocked / needs_review with
// structured reason codes. No AI input.

export const HLVS_READINESS_VERSION = "hlvs-readiness-0.1.0";

export type PackageReadiness = "ready" | "blocked" | "needs_review";

export interface PackageReadinessState {
  blueprintApproved: boolean;
  orderApproved: boolean;
  anyCheckpointRejected: boolean;
  anyCheckpointAccepted: boolean;
  buildCompletionAccepted: boolean;
  conformancePassed: boolean; // conformant | conformant_with_approved_exceptions
  conformancePresent: boolean;
  prohibitedDeviationPresent: boolean;
  catalogUpdateReviewed: boolean;
  sourceReferencePresent: boolean;
  moduleVersionsPresent: boolean;
  productionEligibleDependencies: boolean;
  incomplete?: boolean;
}

const RULES: { code: string; ok: (s: PackageReadinessState) => boolean }[] = [
  { code: "blueprint_not_approved", ok: (s) => s.blueprintApproved },
  { code: "order_not_approved", ok: (s) => s.orderApproved },
  { code: "checkpoint_report_rejected", ok: (s) => !s.anyCheckpointRejected },
  { code: "required_checkpoint_incomplete", ok: (s) => s.anyCheckpointAccepted },
  { code: "build_completion_report_missing", ok: (s) => s.buildCompletionAccepted },
  { code: "conformance_missing", ok: (s) => s.conformancePresent },
  { code: "conformance_not_passed", ok: (s) => s.conformancePassed },
  { code: "prohibited_deviation", ok: (s) => !s.prohibitedDeviationPresent },
  { code: "catalog_update_not_reviewed", ok: (s) => s.catalogUpdateReviewed },
  { code: "source_reference_missing", ok: (s) => s.sourceReferencePresent },
  { code: "module_version_missing", ok: (s) => s.moduleVersionsPresent },
  {
    code: "production_ineligible_dependency",
    ok: (s) => s.productionEligibleDependencies,
  },
];

export interface PackageReadinessResult {
  readiness: PackageReadiness;
  reasons: string[];
  engineVersion: string;
}

export function evaluatePackageReadiness(
  state: PackageReadinessState,
): PackageReadinessResult {
  const reasons = RULES.filter((r) => !r.ok(state)).map((r) => r.code);
  let readiness: PackageReadiness;
  if (reasons.length === 0) readiness = "ready";
  else if (state.incomplete) readiness = "needs_review";
  else readiness = "blocked";
  return { readiness, reasons, engineVersion: HLVS_READINESS_VERSION };
}
