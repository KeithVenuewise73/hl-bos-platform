import { describe, it, expect } from "vitest";
import {
  SITE_MAP,
  DIGITAL_JOURNEY,
  NAV_HIERARCHY,
  MARKETPLACE_EXPERIENCES,
  CUSTOMER_PORTAL_SECTIONS,
  digitalCapabilityReuse,
  hermanLegacyDigital,
} from "./herman-legacy-digital";

describe("Deliverable 1/3 — site map + navigation", () => {
  it("covers every required top-level surface", () => {
    const names = SITE_MAP.map((n) => n.name);
    for (const req of [
      "Home",
      "About",
      "Industries",
      "Solutions",
      "Business Transformation",
      "VisibilityAI",
      "Marketing & Growth",
      "Innovation Marketplace",
      "Customer Portal",
      "Book Assessment",
      "Resources",
      "Case Studies",
      "Contact",
      "AI Assistant",
    ]) {
      expect(names).toContain(req);
    }
  });

  it("marks the Customer Portal authenticated and public pages public", () => {
    expect(SITE_MAP.find((n) => n.name === "Customer Portal")!.auth).toBe(
      "authenticated",
    );
    expect(SITE_MAP.find((n) => n.name === "Home")!.auth).toBe("public");
  });

  it("navigation hierarchy references only real site nodes", () => {
    const names = new Set(SITE_MAP.map((n) => n.name));
    for (const g of NAV_HIERARCHY) {
      for (const item of g.items) expect(names.has(item)).toBe(true);
    }
  });
});

describe("Deliverable 2 — customer journey", () => {
  it("maps the full Visitor → Renewal journey", () => {
    expect(DIGITAL_JOURNEY).toHaveLength(10);
    expect(DIGITAL_JOURNEY[0]!.name).toBe("Visitor");
    expect(DIGITAL_JOURNEY.at(-1)!.name).toBe("Renewal");
    expect(DIGITAL_JOURNEY.map((s) => s.name)).toContain("Innovation Marketplace");
  });
});

describe("Deliverable 4 — capability reuse assessment", () => {
  const r = digitalCapabilityReuse();

  it("assesses 15 capabilities, overwhelmingly reused", () => {
    expect(r.total).toBe(15);
    expect(r.reusePct).toBeGreaterThanOrEqual(85);
  });

  it("honestly flags the customer-facing dashboard surface as net-new", () => {
    expect(r.netNewCapabilities).toContain("Customer dashboards");
  });
});

describe("Deliverable 5 — Innovation Marketplace (three experiences)", () => {
  it("defines public, authenticated-client, and internal tiers", () => {
    expect(MARKETPLACE_EXPERIENCES.map((m) => m.tier)).toEqual([
      "public",
      "authenticated_client",
      "internal",
    ]);
    const internal = MARKETPLACE_EXPERIENCES.find((m) => m.tier === "internal")!;
    expect(internal.shows).toContain("Assembly percentage");
    expect(internal.shows).toContain("Factory readiness");
    const client = MARKETPLACE_EXPERIENCES.find(
      (m) => m.tier === "authenticated_client",
    )!;
    expect(client.shows).toContain("Products already owned");
  });
});

describe("Deliverable 6 — Customer Portal spec", () => {
  it("specifies portal sections, each backed by an existing system", () => {
    expect(CUSTOMER_PORTAL_SECTIONS.length).toBeGreaterThan(0);
    for (const s of CUSTOMER_PORTAL_SECTIONS)
      expect(s.backing.length).toBeGreaterThan(0);
  });
});

describe("The assembled information architecture", () => {
  it("backs every site node with a named capability (no orphan surfaces)", () => {
    const ia = hermanLegacyDigital();
    expect(ia.allNodesBacked).toBe(true);
    expect(ia.siteMap.length).toBe(14);
    expect(ia.reuse.total).toBe(15);
  });
});
