import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import {
  APPLICATIONS,
  applicationByKey,
  applicationsByCategory,
  reconcileWorkspaceApps,
  type ApplicationRecord,
} from "./app-registry";

describe("enterprise application registry", () => {
  it("has unique keys and required fields on every record", () => {
    const keys = APPLICATIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of APPLICATIONS) {
      expect(a.name).toBeTruthy();
      expect(a.repository).toBeTruthy();
      expect(a.executiveOwner).toBeTruthy();
      expect(a.evidence).toBeTruthy();
    }
  });

  it("registers every workspace app under apps/ (governance)", () => {
    const appsDir = path.resolve(__dirname, "../../../apps");
    const dirs = readdirSync(appsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const r = reconcileWorkspaceApps(dirs);
    expect(r.unregistered).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("recovers the legacy HLVS Venture Studio honestly (no invented URL)", () => {
    const hlvs = applicationByKey("hlvs-venture-studio");
    expect(hlvs).toBeDefined();
    expect(hlvs?.category).toBe("legacy");
    expect(hlvs?.productionUrl).toBeNull();
    expect(hlvs?.deploymentStatus).toBe("unknown");
  });

  it("never fabricates a URL: any deployed/external app has a real or null URL", () => {
    for (const a of APPLICATIONS) {
      // productionUrl is either null or an absolute https URL — never a guess string
      if (a.productionUrl !== null) {
        expect(a.productionUrl.startsWith("https://")).toBe(true);
      }
    }
  });

  it("marks the executive portal as not-deployed (Deploy workflow never ran)", () => {
    const portal = applicationByKey("executive-portal");
    expect(portal?.deploymentStatus).toBe("not_deployed");
    expect(portal?.productionUrl).toBeNull();
  });

  it("categorizes the portfolio", () => {
    expect(applicationsByCategory("platform").length).toBeGreaterThan(0);
    expect(applicationsByCategory("web_property").length).toBeGreaterThan(0);
    expect(applicationsByCategory("government").length).toBeGreaterThan(0);
  });

  it("keeps localhost-only apps free of a production URL", () => {
    const cc = applicationByKey("control-center");
    expect(cc?.productionUrl).toBeNull();
    expect(cc?.hosting).toMatch(/local/i);
  });

  it("every record's health is an allowed value", () => {
    const allowed = new Set<ApplicationRecord["health"]>([
      "green",
      "yellow",
      "red",
      "unknown",
    ]);
    for (const a of APPLICATIONS) expect(allowed.has(a.health)).toBe(true);
  });
});
