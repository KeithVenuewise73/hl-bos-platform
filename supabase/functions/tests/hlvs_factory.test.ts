// Checkpoint 8 — HLVS factory edge-layer unit tests (Deno).
//
// Covers the deterministic, offline half that lives in the edge layer:
//   * prompt.ts — deterministic prompt-package generation; text/markdown/json
//     exports; refuses secrets; live_execution always false.
//   * conformance.ts — deterministic verdict + structured reasons; non-
//     exceptionable failures never clear; no AI input.
//   * readiness.ts — deterministic Factory-Build-Package readiness + reasons.
//   * adapter.ts — the INERT development adapter: external_execution false;
//     never contacts Claude; refuses secrets / non-inert prompts.
//
// The DB half (catalog/blueprint/order/prompt/run/reports/conformance/package/
// intake lifecycle, RLS, permissions, events, audit) is covered by
// supabase/tests/27_hlvs_factory.sql.
//
// Self-contained + offline. CI runs `deno test`; where Deno is unavailable the
// identical file runs under Node 22 via the `tsx` Deno.test shim.

import {
  generatePromptPackage,
  PROMPT_GENERATOR_VERSION,
  type CreationOrderView,
} from "../_shared/hlvs/prompt.ts";
import {
  evaluateConformance,
  exceptionIsPermitted,
  NON_EXCEPTIONABLE,
  type ConformanceInput,
} from "../_shared/hlvs/conformance.ts";
import {
  evaluatePackageReadiness,
  type PackageReadinessState,
} from "../_shared/hlvs/readiness.ts";
import { InertDevelopmentAdapter } from "../_shared/hlvs/adapter.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg: string) {
  if (a !== b) throw new Error(`assertion failed: ${msg} (got ${a}, want ${b})`);
}

// ===========================================================================
// PROMPT GENERATOR
// ===========================================================================

const ORDER: CreationOrderView = {
  orderId: "ord-1",
  blueprintId: "bp-1",
  productKey: "reception_ai",
  buildScope: {
    modules_reuse: ["mod_a"],
    new_modules_authorized: [],
    prohibited: ["duplicate_billing"],
    required_modules: ["mod_a"],
  },
  technicalContext: {
    repository: "hl-bos-platform",
    branch: "feature/x",
    supabase_project_classification: "local_only",
    schemas: ["hlvs"],
  },
  executionPlan: { checkpoints: [{ number: 1, objective: "Foundations" }] },
};

Deno.test("prompt: deterministic, versioned, with all three exports", () => {
  const a = generatePromptPackage(ORDER);
  const b = generatePromptPackage(ORDER);
  assertEquals(
    JSON.stringify(a.jsonExport),
    JSON.stringify(b.jsonExport),
    "deterministic",
  );
  assertEquals(a.version, PROMPT_GENERATOR_VERSION, "version stamped");
  assert(a.textExport.length > 0, "text export");
  assert(a.markdownExport.startsWith("# HLVS Prompt Package"), "markdown export");
  assert(typeof a.jsonExport === "object", "json export");
});

Deno.test(
  "prompt: mandatory reuse + prohibited duplication + no live execution",
  () => {
    const p = generatePromptPackage(ORDER);
    assertEquals(
      p.jsonExport.mandatory_reuse_analysis,
      true,
      "reuse analysis required",
    );
    assertEquals(p.jsonExport.live_execution, false, "live_execution false");
    assert(
      Array.isArray(p.jsonExport.prohibited_duplication),
      "prohibited duplication carried",
    );
    assert(
      (p.jsonExport.prohibited_duplication as string[]).includes("duplicate_billing"),
      "prohibited item present",
    );
  },
);

Deno.test("prompt: refuses to generate if a secret is present", () => {
  const bad = {
    ...ORDER,
    technicalContext: { ...ORDER.technicalContext, branch: "sk-ant-deadbeefcafe1234" },
  };
  let threw = false;
  try {
    generatePromptPackage(bad);
  } catch (e) {
    threw = String(e).includes("secret_detected");
  }
  assert(threw, "secret in order refused");
});

// ===========================================================================
// CONFORMANCE
// ===========================================================================

function baseConf(over: Partial<ConformanceInput> = {}): ConformanceInput {
  return {
    requiredModules: ["mod_a"],
    newModulesAuthorized: [],
    reports: [{ modulesCreated: ["mod_a"], accepted: true }],
    buildCompletionReportPresent: true,
    ...over,
  };
}

Deno.test("conformance: all required modules reported → conformant", () => {
  const r = evaluateConformance(baseConf());
  assertEquals(r.verdict, "conformant", "conformant");
  assertEquals(r.blocking.length, 0, "no blocking");
});

Deno.test(
  "conformance: missing required module → nonconformant with structured reason",
  () => {
    const r = evaluateConformance(
      baseConf({ reports: [{ modulesCreated: [], accepted: true }] }),
    );
    assertEquals(r.verdict, "nonconformant", "nonconformant");
    assert(r.blocking.includes("required_module_missing:mod_a"), "structured reason");
  },
);

Deno.test("conformance: an exceptionable gap clears with an approved exception", () => {
  const r = evaluateConformance(
    baseConf({
      reports: [{ modulesCreated: [], accepted: true }],
      exceptions: ["required_module_missing:mod_a"],
    }),
  );
  assertEquals(
    r.verdict,
    "conformant_with_approved_exceptions",
    "flips with exception",
  );
});

Deno.test("conformance: unauthorized module duplication is non-exceptionable", () => {
  const r = evaluateConformance(
    baseConf({ reports: [{ modulesCreated: ["mod_a", "rogue"], accepted: true }] }),
  );
  assert(r.nonExceptionable.includes("unauthorized_module_duplication"), "detected");
  // even if someone lists it as an exception, it does not clear
  const r2 = evaluateConformance(
    baseConf({
      reports: [{ modulesCreated: ["mod_a", "rogue"], accepted: true }],
      exceptions: ["unauthorized_module_duplication"],
    }),
  );
  assertEquals(r2.verdict, "nonconformant", "non-exceptionable never clears");
  assert(
    !exceptionIsPermitted("unauthorized_module_duplication"),
    "not permitted as an exception",
  );
  assert(!exceptionIsPermitted("secret_exposure"), "secret exposure not exceptionable");
  assertEquals(NON_EXCEPTIONABLE.size, 7, "seven non-exceptionable rules");
});

Deno.test("conformance: a reported production action is non-exceptionable", () => {
  const r = evaluateConformance(
    baseConf({
      reports: [{ modulesCreated: ["mod_a"], productionAction: true, accepted: true }],
    }),
  );
  assert(
    r.nonExceptionable.includes("unapproved_production_deployment"),
    "production action flagged",
  );
  assertEquals(r.verdict, "nonconformant", "nonconformant");
});

Deno.test("conformance: no build completion report → incomplete", () => {
  const r = evaluateConformance(
    baseConf({
      reports: [{ modulesCreated: [], accepted: true }],
      buildCompletionReportPresent: false,
    }),
  );
  assertEquals(r.verdict, "incomplete", "incomplete without a completion report");
});

// ===========================================================================
// READINESS
// ===========================================================================

function readyPkg(): PackageReadinessState {
  return {
    blueprintApproved: true,
    orderApproved: true,
    anyCheckpointRejected: false,
    anyCheckpointAccepted: true,
    buildCompletionAccepted: true,
    conformancePassed: true,
    conformancePresent: true,
    prohibitedDeviationPresent: false,
    catalogUpdateReviewed: true,
    sourceReferencePresent: true,
    moduleVersionsPresent: true,
    productionEligibleDependencies: true,
  };
}

Deno.test("readiness: a complete package is ready", () => {
  const r = evaluatePackageReadiness(readyPkg());
  assertEquals(r.readiness, "ready", "ready");
  assertEquals(r.reasons.length, 0, "no reasons");
});

Deno.test("readiness: each gate yields its own reason", () => {
  const cases: [Partial<PackageReadinessState>, string][] = [
    [{ conformancePassed: false }, "conformance_not_passed"],
    [{ prohibitedDeviationPresent: true }, "prohibited_deviation"],
    [{ buildCompletionAccepted: false }, "build_completion_report_missing"],
    [{ catalogUpdateReviewed: false }, "catalog_update_not_reviewed"],
    [{ moduleVersionsPresent: false }, "module_version_missing"],
    [{ productionEligibleDependencies: false }, "production_ineligible_dependency"],
  ];
  for (const [patch, code] of cases) {
    const r = evaluatePackageReadiness({ ...readyPkg(), ...patch });
    assertEquals(r.readiness, "blocked", `blocked for ${code}`);
    assert(r.reasons.includes(code), `reason ${code}`);
  }
});

// ===========================================================================
// INERT ADAPTER
// ===========================================================================

Deno.test(
  "adapter: accepts an inert prompt and reports external_execution false",
  () => {
    const ad = new InertDevelopmentAdapter();
    const receipt = ad.submit(
      { version: "v1", jsonExport: { live_execution: false } },
      "run-1",
    );
    assert(receipt.accepted, "accepted");
    assertEquals(receipt.external_execution, false, "external_execution false");
    assert(receipt.note.includes("NOT contacted"), "Claude not contacted");
  },
);

Deno.test("adapter: refuses a non-inert prompt and a secret-bearing prompt", () => {
  const ad = new InertDevelopmentAdapter();
  const live = ad.submit(
    { version: "v1", jsonExport: { live_execution: true } },
    "run-1",
  );
  assert(!live.accepted, "refuses live_execution=true");
  assertEquals(live.external_execution, false, "still no external execution");
  const secret = ad.submit(
    {
      version: "v1",
      jsonExport: { live_execution: false, leak: "sk-ant-deadbeefcafe1234" },
    },
    "run-1",
  );
  assert(!secret.accepted, "refuses a secret-bearing prompt");
});

Deno.test("adapter: fixture report ingestion never executes externally", () => {
  const ad = new InertDevelopmentAdapter();
  const rep = ad.ingestFixtureReport(1, "Foundations");
  assertEquals(rep.external_execution, false, "external_execution false");
  assert(rep.accepted, "fixture accepted");
});
