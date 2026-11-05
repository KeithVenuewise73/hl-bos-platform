import { describe, expect, it } from "vitest";

import type { Prospect } from "@hl-bos/presence-scanner";

import { consoleConnectorEvidence, growthView } from "./growth";

const NOW = new Date("2026-11-05T12:00:00.000Z");

function lead(id: string, over: Partial<Prospect> = {}): Prospect {
  return {
    id,
    dedupeKey: `id:${id}`,
    placeId: undefined,
    name: `Lead ${id}`,
    vertical: "contractor",
    market: { label: "Buffalo", zip: undefined, radiusMiles: 10 },
    address: undefined,
    phone: undefined,
    email: undefined,
    website: undefined,
    corrections: {},
    places: undefined,
    importedRating: undefined,
    importedReviewCount: undefined,
    distanceMiles: undefined,
    websiteStatus: "none",
    findings: [],
    score: { version: "v", total: 0, checkedMax: 10, components: [] },
    qualification: { computed: "qualified", checks: [], override: undefined },
    services: [],
    stage: "qualified",
    notes: [],
    audit: [],
    firstSeenAt: "2026-10-01T00:00:00Z",
    lastScannedAt: "2026-10-01T00:00:00Z",
    scanIds: [],
    ...over,
  };
}

describe("console Growth Intelligence view", () => {
  it("with no saved leads, every figure is 'no data' or 'not connected' — never a zero", () => {
    const v = growthView([], consoleConnectorEvidence(), NOW);
    expect(v.leadCount).toBe(0);
    for (const d of v.dashboards)
      for (const m of d.metrics) {
        expect(m.value).toBeNull();
        expect(["no_data", "not_supported", "not_connected"]).toContain(m.status);
      }
  });

  it("the console holds no Google credential, so nothing reads as connected", () => {
    const v = growthView([], consoleConnectorEvidence(), NOW);
    expect(v.connectors.every((c) => c.status === "not_connected")).toBe(true);
  });

  it("routes saved leads to their business and counts them separately", () => {
    const v = growthView(
      [
        lead("a"),
        lead("b", {
          vertical: "professional_services",
          places: {
            record: { primaryTypeLabel: "Trucking company" } as never,
            observedAt: "",
            expiresAt: "",
          },
        }),
      ],
      [],
      NOW,
    );
    expect(v.routed).toEqual({ hld: 1, hscs: 1 });
    const [hld, hscs, all] = v.dashboards;
    const discovered = (d: typeof hld) =>
      d!.metrics.find((m) => m.key === "discovered")!.value;
    expect(discovered(hld)).toBe(1);
    expect(discovered(hscs)).toBe(1);
    expect(discovered(all)).toBe(2);
  });

  it("inquiries, referrals and consultations are unknown, not zero — the scanner does not record them", () => {
    const v = growthView([lead("a")], [], NOW);
    const hld = v.dashboards[0]!;
    for (const key of ["inbound", "referrals", "consultations"]) {
      expect(hld.metrics.find((m) => m.key === key)).toMatchObject({
        value: null,
        status: "not_connected",
      });
    }
    expect(hld.metrics.find((m) => m.key === "discovered")).toMatchObject({
      value: 1,
      status: "measured",
    });
  });
});
