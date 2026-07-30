import { describe, it, expect } from "vitest";
import { MODULE_REGISTRY } from "./modules";
import { CATALOG } from "./registry";
import {
  CAPABILITIES,
  capabilityById,
  capabilityByAlias,
  capabilityForModule,
  productsForCapability,
  applicationsForCapability,
  reconcileCapabilities,
  capabilityInventory,
  isReusableNow,
  KNOWN_CAPABILITY_SOURCES,
} from "./capabilities";
import {
  duplicateCheck,
  evaluateReuse,
  canRegister,
  aliasCollisions,
} from "./capability-reuse";

describe("canonical capability library — identity & governance", () => {
  it("1. a canonical capability can be registered and found by id", () => {
    const c = capabilityById("identity_access");
    expect(c).toBeDefined();
    expect(c?.displayName).toBe("Identity & Access");
  });

  it("2. capabilities have stable, unique identities (id + no alias collisions)", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(aliasCollisions()).toEqual([]);
  });

  it("13. every capability retains repository evidence", () => {
    for (const c of CAPABILITIES) {
      expect(c.evidence, `${c.id} must cite evidence`).toBeTruthy();
      expect(c.sourceSystems.length).toBeGreaterThan(0);
    }
  });

  it("only allow-listed source systems are used", () => {
    const allowed = new Set<string>(KNOWN_CAPABILITY_SOURCES);
    for (const c of CAPABILITIES) {
      for (const s of c.sourceSystems) expect(allowed.has(s)).toBe(true);
    }
  });
});

describe("capability relationships (links, not merges)", () => {
  it("3. applications can reference capabilities via their modules", () => {
    // executive-portal reuses identity_core → identity_access
    const apps = applicationsForCapability("identity_access");
    expect(apps.length).toBeGreaterThan(0);
  });

  it("4. products/modules reference capabilities", () => {
    // hl_bti composition uses bti_platform → executive_dashboards
    const products = productsForCapability("executive_dashboards");
    expect(products).toContain("hl_bti");
    expect(capabilityForModule("scoring_engine")?.id).toBe("deterministic_scoring");
  });

  it("5. dependencies are represented between capabilities", () => {
    const billing = capabilityById("billing");
    expect(billing?.dependsOn).toContain("entitlements");
  });

  it("6. planned capabilities are distinguishable from implemented", () => {
    const scheduling = capabilityById("scheduling");
    expect(scheduling?.maturity).toBe("planned");
    expect(scheduling?.providedByModules).toEqual([]);
    expect(isReusableNow(scheduling!)).toBe(false);

    const identity = capabilityById("identity_access")!;
    expect(identity.maturity).toBe("implemented");
    expect(isReusableNow(identity)).toBe(true);
  });
});

describe("legacy compatibility mapping + no parallel registries", () => {
  it("9. legacy structures map into the canonical model", () => {
    // every hlvs.capabilities key resolves (via alias/consolidation)
    for (const key of [
      "ai_receptionist",
      "reputation_recovery",
      "scheduling",
      "event_management",
      "registration",
      "route_assessment",
      "kpi_scoring",
      "communications",
      "tenant_identity",
      "document_extraction",
    ]) {
      expect(capabilityByAlias(key), `hlvs.capabilities:${key}`).toBeDefined();
    }
  });

  it("10 & 12. reconciliation covers every legacy registry (no bypass)", () => {
    const r = reconcileCapabilities();
    expect(r.unmappedModules).toEqual([]);
    expect(r.unmappedBusinessCapabilities).toEqual([]);
    expect(r.unknownSources).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("every MODULE_REGISTRY module maps to a canonical capability", () => {
    for (const m of MODULE_REGISTRY) {
      expect(capabilityForModule(m.key), `module ${m.key}`).toBeDefined();
    }
  });

  it("every business_capability asset maps to a canonical capability", () => {
    const biz = CATALOG.assets.filter((a) => a.kind === "business_capability");
    for (const a of biz) {
      const key = a.id.replace(/^cap\./, "");
      const mapped =
        capabilityByAlias(key) !== undefined ||
        CAPABILITIES.some((c) => c.duplicatesConsolidated.includes(a.id));
      expect(mapped, `business_capability ${a.id}`).toBe(true);
    }
  });
});

describe("deterministic duplicate detection", () => {
  it("7. exact match → REUSE_EXISTING (deterministic)", () => {
    const r = duplicateCheck({ name: "scheduling" });
    expect(r.verdict).toBe("REUSE_EXISTING");
    expect(r.matches[0]?.capabilityId).toBe("scheduling");
    // deterministic: same input, same output
    expect(duplicateCheck({ name: "scheduling" })).toEqual(r);
  });

  it("7. strong-but-not-exact overlap → EXTEND_EXISTING or POSSIBLE_OVERLAP", () => {
    const r = duplicateCheck({
      name: "appointment booking",
      domain: "operations",
      functionalPurpose: "book and schedule customer appointments and resources",
    });
    expect(["EXTEND_EXISTING", "POSSIBLE_OVERLAP", "MANUAL_REVIEW_REQUIRED"]).toContain(
      r.verdict,
    );
    expect(r.matches.length).toBeGreaterThan(0);
  });

  it("7. genuinely new → BUILD_NEW", () => {
    const r = duplicateCheck({
      name: "quantum telemetry mesh",
      domain: "platform",
      functionalPurpose: "orbital satellite packet routing",
    });
    expect(r.verdict).toBe("BUILD_NEW");
    expect(r.reasonCodes).toContain("NO_SIGNIFICANT_MATCH");
  });

  it("8. an exact duplicate cannot silently register", () => {
    expect(canRegister({ name: "scheduling" }).ok).toBe(false);
    expect(canRegister({ name: "communications" }).ok).toBe(false);
    // a genuinely new capability is admissible
    expect(canRegister({ name: "quantum telemetry mesh" }).ok).toBe(true);
  });

  it("multiple exact matches → CONSOLIDATE_DUPLICATES", () => {
    // "reputation_recovery" and "reviews" are both aliases of reputation_management,
    // but a proposal aliasing two DISTINCT canonical caps triggers consolidation.
    const r = duplicateCheck({
      name: "identity",
      aliases: ["scheduling"], // aliases of two different canonical capabilities
    });
    expect(r.verdict).toBe("CONSOLIDATE_DUPLICATES");
    expect(r.reasonCodes).toContain("MULTIPLE_EXACT_MATCHES");
  });
});

describe("reuse decision contract", () => {
  it("reuse verdict does not permit the build queue; new work does", () => {
    const reuse = evaluateReuse({ name: "communications" });
    expect(reuse.recommendedAction).toBe("REUSE_EXISTING");
    expect(reuse.mayEnterBuildQueue).toBe(false);
    expect(reuse.requiredHumanReview).toBe(false);
    expect(reuse.existsRelated).toBe(true);

    const build = evaluateReuse({
      name: "quantum telemetry mesh",
      functionalPurpose: "orbital satellite packet routing",
    });
    expect(build.recommendedAction).toBe("BUILD_NEW");
    expect(build.mayEnterBuildQueue).toBe(true);
    expect(build.requiredHumanReview).toBe(true);
  });

  it("surfaces dependencies and risks deterministically", () => {
    const d = evaluateReuse({ name: "ai_receptionist" });
    // ai_receptionist depends on ai_gateway + communications
    expect(d.dependencies).toContain("ai_gateway");
    expect(d.risks.length).toBeGreaterThan(0); // PLANNED best-match risk
  });

  it("no AI is required — contract is pure and deterministic", () => {
    const a = evaluateReuse({ name: "route_assessment" });
    const b = evaluateReuse({ name: "route_assessment" });
    expect(a).toEqual(b);
  });
});

describe("inventory counts", () => {
  it("reports implemented / partial / planned honestly", () => {
    const inv = capabilityInventory();
    expect(inv.total).toBe(CAPABILITIES.length);
    expect(inv.implemented).toBeGreaterThan(0);
    expect(inv.planned).toBeGreaterThan(0);
    expect(inv.implemented + inv.partial + inv.planned + inv.deprecated).toBe(
      inv.total,
    );
  });
});
