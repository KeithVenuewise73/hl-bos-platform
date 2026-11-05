// Test fixtures. Named *.test-helpers.ts so vitest does not run it as a suite.
import type { Finding, Prospect } from "@hl-bos/presence-scanner";

import type { GrowthEvent } from "./types.ts";

const AT = "2026-11-01T12:00:00.000Z";

export function finding(key: string, status: Finding["status"], label = key): Finding {
  return {
    key,
    label,
    status,
    source: "website",
    observedAt: AT,
    evidence: `${label} — ${status} on the homepage`,
    confidence: "high",
  };
}

export function prospect(over: Partial<Prospect> = {}): Prospect {
  return {
    id: "lead-1",
    dedupeKey: "domain:example-barber.test",
    placeId: undefined,
    name: "Example Barber Co",
    vertical: "salon_barber",
    market: { label: "Buffalo", zip: undefined, radiusMiles: 10 },
    address: "1 Main St",
    phone: "7165550100",
    email: undefined,
    website: "https://example-barber.test",
    corrections: {},
    places: undefined,
    importedRating: undefined,
    importedReviewCount: undefined,
    distanceMiles: 2,
    websiteStatus: "ok",
    findings: [
      finding("conv.booking", "not_found", "Online booking"),
      finding("site.mobile", "present", "Mobile layout"),
      finding("reviews.count", "not_checked", "Review count"),
      finding("site.testimonial", "needs_verification", "Testimonial"),
    ],
    score: {
      version: "presence-opportunity-0.2.0",
      total: 40,
      checkedMax: 60,
      components: [
        {
          component: "conversion",
          label: "Conversion",
          max: 20,
          awarded: 15,
          status: "scored",
          note: "",
          contributions: [
            {
              ruleId: "C.no_booking",
              label: "No online booking",
              points: 15,
              findingKeys: ["conv.booking"],
            },
          ],
        },
      ],
    },
    qualification: { computed: "qualified", checks: [], override: undefined },
    services: [
      {
        service: "Lead Generation System",
        dimension: "conversion",
        priority: "high",
        rationale: "Visitors cannot book online.",
      },
      {
        service: "Reputation Management",
        dimension: "reviews",
        priority: "medium",
        rationale: "Review presence unknown.",
      },
    ],
    stage: "qualified",
    notes: [],
    audit: [],
    firstSeenAt: "2026-10-01T12:00:00.000Z",
    lastScannedAt: AT,
    scanIds: ["scan-1"],
    ...over,
  };
}

let n = 0;
export function ev(
  over: Partial<GrowthEvent> & Pick<GrowthEvent, "kind" | "leadId">,
): GrowthEvent {
  n += 1;
  return {
    id: `e${n}`,
    line: "hld",
    at: "2026-10-15T12:00:00.000Z",
    channel: "discovery_outreach",
    isDemo: false,
    industry: "Barber",
    ...over,
  };
}
