// Deterministic Software Factory readiness engine (edge mirror of the SQL
// authority in provisioning.evaluate_readiness).
//
// Given a plain, already-gathered state object it returns Ready / Not Ready /
// Blocked plus STRUCTURED blocking reason codes. It takes NO AI input: AI may
// summarize the reasons for a human, but it can never change this result or
// mark readiness passed. Prohibited exception rule codes can never be cleared.

export const READINESS_ENGINE_VERSION = "readiness-0.1.0";

export type Readiness = "ready" | "not_ready" | "blocked";

export interface ReadinessState {
  blueprintApproved: boolean;
  proposalInternallyApproved: boolean;
  proposalAccepted: boolean;
  proposalSuperseded: boolean;
  proposalVersionCurrent: boolean;
  pricingApproved: boolean; // every selected customer-visible line has a sellable price
  agreementsComplete: boolean;
  legalTemplatesReviewed: boolean;
  customerSelectionFinalized: boolean;
  billingSetupApproved: boolean;
  provisioningRequestApproved: boolean;
  servicesActive: boolean;
  modulesActive: boolean;
  dependenciesResolved: boolean;
  entitlementsValid: boolean;
  requiredCredentialsIdentified: boolean;
  requiredContentIdentified: boolean;
  workOrderGenerated: boolean;
  humanApprovalsComplete: boolean;
  /** Active, non-prohibited exceptions keyed by the reason code they clear. */
  exceptions?: string[];
  /** True when prerequisite records don't exist yet (draft/validating). */
  incomplete?: boolean;
}

// Prohibited: an exception can NEVER clear these (missing customer acceptance
// or missing legal authorization). Mirrors the SQL guard.
export const PROHIBITED_EXCEPTIONS = new Set([
  "proposal_not_accepted",
  "agreement_missing",
  "agreement_unreviewed_legal",
]);

interface Rule {
  code: string;
  ok: (s: ReadinessState) => boolean;
}

const RULES: Rule[] = [
  { code: "blueprint_not_approved", ok: (s) => s.blueprintApproved },
  { code: "proposal_not_internally_approved", ok: (s) => s.proposalInternallyApproved },
  { code: "proposal_not_accepted", ok: (s) => s.proposalAccepted },
  { code: "proposal_superseded", ok: (s) => !s.proposalSuperseded },
  { code: "proposal_version_stale", ok: (s) => s.proposalVersionCurrent },
  { code: "price_not_approved", ok: (s) => s.pricingApproved },
  { code: "agreement_missing", ok: (s) => s.agreementsComplete },
  { code: "agreement_unreviewed_legal", ok: (s) => s.legalTemplatesReviewed },
  { code: "selection_not_finalized", ok: (s) => s.customerSelectionFinalized },
  { code: "billing_setup_not_approved", ok: (s) => s.billingSetupApproved },
  { code: "provisioning_not_approved", ok: (s) => s.provisioningRequestApproved },
  { code: "service_inactive", ok: (s) => s.servicesActive },
  { code: "module_inactive", ok: (s) => s.modulesActive },
  { code: "dependency_unresolved", ok: (s) => s.dependenciesResolved },
  { code: "entitlement_invalid", ok: (s) => s.entitlementsValid },
  { code: "credential_missing", ok: (s) => s.requiredCredentialsIdentified },
  { code: "content_missing", ok: (s) => s.requiredContentIdentified },
  { code: "work_order_missing", ok: (s) => s.workOrderGenerated },
  { code: "human_approval_incomplete", ok: (s) => s.humanApprovalsComplete },
];

export interface ReadinessResult {
  status: Readiness;
  reasons: string[];
  clearedByException: string[];
  engineVersion: string;
}

export function evaluateReadiness(state: ReadinessState): ReadinessResult {
  const failing = RULES.filter((r) => !r.ok(state)).map((r) => r.code);
  const active = new Set(
    (state.exceptions ?? []).filter((e) => !PROHIBITED_EXCEPTIONS.has(e)),
  );
  const clearedByException: string[] = [];
  const reasons = failing.filter((code) => {
    if (active.has(code)) {
      clearedByException.push(code);
      return false;
    }
    return true;
  });

  let status: Readiness;
  if (reasons.length === 0) status = "ready";
  else if (state.incomplete) status = "not_ready";
  else status = "blocked";

  return {
    status,
    reasons,
    clearedByException,
    engineVersion: READINESS_ENGINE_VERSION,
  };
}

/** An exception request for a prohibited code must be rejected (never AI-overridable). */
export function exceptionIsPermitted(ruleCode: string): boolean {
  return !PROHIBITED_EXCEPTIONS.has(ruleCode);
}
