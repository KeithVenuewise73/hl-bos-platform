import { describe, it, expect } from "vitest";
import {
  extractCapabilities,
  extractReusableAssets,
  licencePermitsCommercial,
  CAPABILITIES,
  CAPABILITY_ENGINE_VERSION,
  MAX_CAPABILITIES_PER_OPPORTUNITY,
  MIN_CAPABILITY_CONFIDENCE,
  EVIDENCE_WEIGHT,
} from "./capability";

describe("capability vocabulary", () => {
  it("has a stable engine version", () => {
    expect(CAPABILITY_ENGINE_VERSION).toBe("2026-08-20-v1");
  });

  it("uses unique slugs", () => {
    const slugs = CAPABILITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only uses the catalog's domain vocabulary", () => {
    // These are @hl-bos/catalog CapabilityDomain values. If this list and the
    // catalog's ever diverge, the intelligence bridge silently stops joining.
    const domains = new Set([
      "platform",
      "identity",
      "operations",
      "automation",
      "ai",
      "communications",
      "marketing",
      "analytics",
      "commerce",
      "discovery",
      "factory",
      "intelligence",
      "transportation",
    ]);
    for (const c of CAPABILITIES) expect(domains.has(c.domain)).toBe(true);
  });

  it("rates a written description above a repository name", () => {
    // The whole anti-false-positive design rests on this ordering.
    expect(EVIDENCE_WEIGHT.description).toBeGreaterThan(EVIDENCE_WEIGHT.name);
    expect(EVIDENCE_WEIGHT.topics).toBeGreaterThan(EVIDENCE_WEIGHT.name);
  });
});

describe("extractCapabilities", () => {
  it("reads a real routing project from its description", () => {
    const claims = extractCapabilities({
      title: "googlemaps/js-route-optimization-app",
      summary:
        "Route optimization application for planning multi-stop vehicle routing with fleet capacity constraints.",
      topics: ["routing", "fleet", "logistics"],
      repositoryUrl: "https://github.com/googlemaps/js-route-optimization-app",
    });
    const primary = claims.find((c) => c.isPrimary);
    expect(primary?.slug).toBe("route-optimization");
    expect(primary?.evidenceKind).toBe("description");
    expect(primary?.evidenceExcerpt).toContain("route optimization");
  });

  it("does NOT call a web framework a logistics product", () => {
    // "routing" is a weak term precisely because of this case. If weak terms
    // could carry a claim on their own, every frontend framework in the corpus
    // would be labelled route optimization.
    const claims = extractCapabilities({
      title: "remix-run/react-router",
      summary: "Declarative routing for React applications.",
      topics: ["react", "routing", "frontend"],
      repositoryUrl: "https://github.com/remix-run/react-router",
    });
    expect(claims.map((c) => c.slug)).not.toContain("route-optimization");
  });

  it("returns nothing rather than guessing when there is no evidence", () => {
    expect(
      extractCapabilities({
        title: "someone/untitled-project",
        summary: "",
        topics: [],
        repositoryUrl: "https://github.com/someone/untitled-project",
      }),
    ).toEqual([]);
  });

  it("will not claim a capability from a bare repository slug alone", () => {
    // "wms" in a slug and nothing else is too thin to assert a warehouse
    // product. A name match on its own falls under the confidence floor.
    const claims = extractCapabilities({
      title: "acme/wms",
      summary: "",
      topics: [],
      repositoryUrl: "https://github.com/acme/wms",
    });
    expect(claims.map((c) => c.slug)).not.toContain("inventory-warehouse");
  });

  it("allows a corroborated name match, labelled as name evidence and scored low", () => {
    // Corroborating topics lift the same slug over the floor — but the claim
    // still reports that it was read from the NAME, and still scores well below
    // what a written description would earn. Name evidence is reachable and
    // never sufficient on its own.
    const claims = extractCapabilities({
      title: "acme/wms",
      summary: "",
      topics: ["inventory", "warehouse", "stock"],
      repositoryUrl: "https://github.com/acme/wms",
    });
    const wms = claims.find((c) => c.slug === "inventory-warehouse");
    expect(wms?.evidenceKind).toBe("name");
    expect(wms!.confidence).toBeLessThan(Math.round(EVIDENCE_WEIGHT.description * 100));
  });

  it("never exceeds the capability cap and always names exactly one primary", () => {
    const claims = extractCapabilities({
      title: "kitchen/sink",
      summary:
        "CRM with invoicing, billing, workflow automation, api integration, dashboard reporting, scheduling, inventory management and route optimization.",
      topics: ["crm", "billing", "automation", "analytics", "logistics"],
      repositoryUrl: "https://github.com/kitchen/sink",
    });
    expect(claims.length).toBeLessThanOrEqual(MAX_CAPABILITIES_PER_OPPORTUNITY);
    expect(claims.filter((c) => c.isPrimary)).toHaveLength(1);
  });

  it("is deterministic — the same input always gives the same output", () => {
    const input = {
      title: "acme/dispatch",
      summary: "Field service dispatching and work order scheduling.",
      topics: ["scheduling"],
      repositoryUrl: "https://github.com/acme/dispatch",
    };
    expect(extractCapabilities(input)).toEqual(extractCapabilities(input));
  });

  it("never emits a claim below the confidence floor", () => {
    const claims = extractCapabilities({
      title: "acme/thing",
      summary: "A tool that does ocr and has a dashboard.",
      topics: [],
      repositoryUrl: "https://github.com/acme/thing",
    });
    for (const c of claims) {
      expect(c.confidence).toBeGreaterThanOrEqual(MIN_CAPABILITY_CONFIDENCE);
    }
  });

  it("matches on word boundaries, not substrings", () => {
    // "rag" is a strong AI term; "fragment" must not trigger it.
    const claims = extractCapabilities({
      title: "acme/fragment-tool",
      summary: "A fragment storage utility.",
      topics: [],
      repositoryUrl: "https://github.com/acme/fragment-tool",
    });
    expect(claims.map((c) => c.slug)).not.toContain("ai-agents");
  });
});

describe("reusable assets and licensing", () => {
  it("finds assets with their licence attached", () => {
    const assets = extractReusableAssets({
      title: "acme/router",
      summary:
        "Optimization solver with a google maps integration and a component library.",
      topics: [],
      license: "MIT",
      repositoryUrl: "https://github.com/acme/router",
    });
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((a) => a.licence === "MIT")).toBe(true);
    expect(assets.every((a) => a.licencePermitsCommercial === true)).toBe(true);
  });

  it("separates unknown licensing from prohibited licensing", () => {
    // These must never collapse: "we do not know" is not "you may not".
    expect(licencePermitsCommercial("MIT")).toBe(true);
    expect(licencePermitsCommercial("AGPL-3.0")).toBe(false);
    expect(licencePermitsCommercial(null)).toBeNull();
    expect(licencePermitsCommercial("NOASSERTION")).toBeNull();
    expect(licencePermitsCommercial("Some-Custom-Licence")).toBeNull();
  });

  it("returns no assets rather than inventing them", () => {
    expect(
      extractReusableAssets({
        title: "acme/empty",
        summary: "",
        topics: [],
        license: "MIT",
        repositoryUrl: "https://github.com/acme/empty",
      }),
    ).toEqual([]);
  });
});
