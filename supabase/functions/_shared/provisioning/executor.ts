// Inert mock provisioning executor (adapter contract for the Software Factory).
//
// This is the ONLY place a future provisioning executor is described. In
// Checkpoint 7 it is a MOCK: it produces a validation result and an ordered
// execution plan, and it changes NOTHING — no tenant is created, no module
// enabled, no entitlement activated, no domain/secret/integration configured.
// A real executor (a later, CEO-authorized checkpoint) implements the same
// `ProvisioningExecutor` contract against `platform.provision_tenant`,
// `entitlements.activate_module`, etc. — but only when readiness is `ready`.

export type ProvisioningStep =
  | "create_tenant"
  | "create_customer_org"
  | "invite_owner"
  | "invite_users"
  | "assign_roles"
  | "enable_module"
  | "activate_entitlement"
  | "assign_usage_limit"
  | "configure_branding"
  | "configure_domain"
  | "configure_comms_sender"
  | "init_storage_paths"
  | "setup_integration";

export interface ProvisioningRequestPlan {
  requestId: string;
  targetTenantSlug?: string;
  modules: string[];
  services: string[];
  entitlements: { moduleKey: string; entitlementKey: string; usageLimit?: number }[];
  owner?: { email?: string };
  domains?: string[];
  environmentTarget: "none" | "staging" | "production";
  readiness: "ready" | "not_ready" | "blocked";
}

export interface PlannedAction {
  step: ProvisioningStep;
  detail: Record<string, unknown>;
}

export interface ExecutionResult {
  executed: false; // ALWAYS false in this checkpoint
  valid: boolean;
  plan: PlannedAction[];
  validationErrors: string[];
  note: string;
}

// The contract a real executor will implement. The mock satisfies it inertly.
export interface ProvisioningExecutor {
  plan(req: ProvisioningRequestPlan): PlannedAction[];
  execute(req: ProvisioningRequestPlan): Promise<ExecutionResult>;
}

function buildPlan(req: ProvisioningRequestPlan): PlannedAction[] {
  const plan: PlannedAction[] = [];
  plan.push({
    step: "create_tenant",
    detail: { slug: req.targetTenantSlug ?? "(assigned at run time)" },
  });
  plan.push({ step: "create_customer_org", detail: {} });
  if (req.owner?.email)
    plan.push({ step: "invite_owner", detail: { email: req.owner.email } });
  for (const m of req.modules)
    plan.push({ step: "enable_module", detail: { module: m } });
  for (const e of req.entitlements)
    plan.push({
      step: "activate_entitlement",
      detail: { entitlement: e.entitlementKey, usageLimit: e.usageLimit ?? null },
    });
  for (const d of req.domains ?? [])
    plan.push({ step: "configure_domain", detail: { domain: d } });
  plan.push({ step: "init_storage_paths", detail: {} });
  return plan;
}

function validate(req: ProvisioningRequestPlan): string[] {
  const errors: string[] = [];
  if (req.readiness !== "ready") errors.push(`readiness_not_ready:${req.readiness}`);
  if (req.environmentTarget === "production")
    errors.push("production_target_forbidden_in_checkpoint");
  if (req.modules.length === 0 && req.services.length === 0)
    errors.push("nothing_to_provision");
  return errors;
}

export class MockProvisioningExecutor implements ProvisioningExecutor {
  plan(req: ProvisioningRequestPlan): PlannedAction[] {
    return buildPlan(req);
  }
  execute(req: ProvisioningRequestPlan): Promise<ExecutionResult> {
    const validationErrors = validate(req);
    // Deliberately performs NO side effects. Even a "ready" request only yields
    // a plan; actual execution is a separate, CEO-authorized checkpoint.
    return Promise.resolve({
      executed: false,
      valid: validationErrors.length === 0,
      plan: buildPlan(req),
      validationErrors,
      note: "inert: mock executor made no changes to any system",
    });
  }
}
