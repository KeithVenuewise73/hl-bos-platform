// Deterministic blueprint-conformance engine (HLVS Factory, edge mirror of the
// SQL authority hlvs.run_conformance). Given the order's build scope and the
// submitted checkpoint reports + build completion report, it produces a verdict
// and structured blocking reasons. It takes NO AI input — an AI summary can
// never replace this result. Certain failures are NON-EXCEPTIONABLE.

export const CONFORMANCE_ENGINE_VERSION = "hlvs-conformance-0.1.0";

export type Verdict =
  "conformant" | "conformant_with_approved_exceptions" | "nonconformant" | "incomplete";

export const NON_EXCEPTIONABLE = new Set([
  "unapproved_production_deployment",
  "secret_exposure",
  "unapproved_tenant_creation",
  "unapproved_billing_activation",
  "missing_human_approval",
  "unauthorized_module_duplication",
  "missing_security_controls",
]);

export interface ConformanceInput {
  requiredModules: string[];
  newModulesAuthorized: string[];
  reports: {
    modulesCreated?: string[];
    modulesReused?: string[];
    productionAction?: boolean;
    secretExposure?: boolean;
    accepted: boolean;
  }[];
  buildCompletionReportPresent: boolean;
  exceptions?: string[]; // approved, non-prohibited exceptions
}

export interface ConformanceResult {
  verdict: Verdict;
  blocking: string[];
  nonExceptionable: string[];
  engineVersion: string;
}

export function evaluateConformance(input: ConformanceInput): ConformanceResult {
  const reported = new Set<string>();
  for (const r of input.reports) {
    for (const m of r.modulesCreated ?? []) reported.add(m);
    for (const m of r.modulesReused ?? []) reported.add(m);
  }
  const blocking: string[] = [];
  const nonExceptionable: string[] = [];

  for (const m of input.requiredModules) {
    if (!reported.has(m)) blocking.push(`required_module_missing:${m}`);
  }
  if (!input.buildCompletionReportPresent)
    blocking.push("build_completion_report_missing");

  if (input.reports.some((r) => r.productionAction)) {
    nonExceptionable.push("unapproved_production_deployment");
    blocking.push("unapproved_production_deployment");
  }
  if (input.reports.some((r) => r.secretExposure)) {
    nonExceptionable.push("secret_exposure");
    blocking.push("secret_exposure");
  }
  const authorized = new Set([...input.requiredModules, ...input.newModulesAuthorized]);
  for (const r of input.reports) {
    for (const m of r.modulesCreated ?? []) {
      if (!authorized.has(m)) {
        if (!nonExceptionable.includes("unauthorized_module_duplication"))
          nonExceptionable.push("unauthorized_module_duplication");
        if (!blocking.includes("unauthorized_module_duplication"))
          blocking.push("unauthorized_module_duplication");
      }
    }
  }

  // Apply approved, non-prohibited exceptions.
  const active = new Set(
    (input.exceptions ?? []).filter((e) => !NON_EXCEPTIONABLE.has(e)),
  );
  const remaining = blocking.filter((b) => !active.has(b));
  const anyNonExceptionableRemains = remaining.some((b) => NON_EXCEPTIONABLE.has(b));

  let verdict: Verdict;
  if (blocking.length === 0) verdict = "conformant";
  else if (!input.buildCompletionReportPresent) verdict = "incomplete";
  else if (remaining.length === 0 && !anyNonExceptionableRemains)
    verdict = "conformant_with_approved_exceptions";
  else verdict = "nonconformant";

  return {
    verdict,
    blocking,
    nonExceptionable,
    engineVersion: CONFORMANCE_ENGINE_VERSION,
  };
}

export function exceptionIsPermitted(ruleKey: string): boolean {
  return !NON_EXCEPTIONABLE.has(ruleKey);
}
