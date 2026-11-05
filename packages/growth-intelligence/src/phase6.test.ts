import { describe, expect, it } from "vitest";

import {
  CORE_INDUSTRIES,
  DiscoveryDisabledError,
  INDUSTRIES,
  InquiryValidationError,
  REVENUE_API_SURFACE,
  SurfaceError,
  buildInquiry,
  fromHldLeadRecord,
  fromHscsAssessmentRequest,
  identityKeys,
  normaliseBusinessName,
  normaliseDomain,
  placesDiscovery,
  planBackfill,
  submitInquiry,
  supabaseRpc,
  type HlbosRpc,
  type InquiryInput,
  type SupabaseLike,
} from "./index.ts";

const AT = "2026-11-05T12:00:00.000Z";

describe("eight-industry model", () => {
  it("is the confirmed eight, 5 HLD and 3 HSCS, 50 each, 400 in all", () => {
    expect(CORE_INDUSTRIES.map((i) => i.key)).toEqual([
      "dental",
      "barbershop",
      "salon",
      "landscaping",
      "pet_grooming",
      "moving",
      "transportation",
      "third_party_logistics",
    ]);
    expect(CORE_INDUSTRIES.filter((i) => i.line === "hld")).toHaveLength(5);
    expect(CORE_INDUSTRIES.filter((i) => i.line === "hscs")).toHaveLength(3);
    expect(CORE_INDUSTRIES.reduce((s, i) => s + i.targetActive, 0)).toBe(400);
    expect(INDUSTRIES.filter((i) => !i.core).every((i) => i.targetActive === 0)).toBe(
      true,
    );
  });

  it("backfill counts active + qualified toward the target; rejected never count", () => {
    const [p] = planBackfill(
      [
        {
          industryKey: "salon",
          active: 40,
          qualified: 5,
          rejected: 30,
          disqualified: 2,
        },
      ],
      CORE_INDUSTRIES.filter((i) => i.key === "salon"),
    );
    expect(p).toMatchObject({ open: 45, deficit: 5, target: 50 });
    const [q] = planBackfill(
      [],
      CORE_INDUSTRIES.filter((i) => i.key === "moving"),
      { moving: 10 },
    );
    expect(q).toMatchObject({ open: 0, deficit: 10, target: 10 });
  });
});

describe("business identity", () => {
  it("treats alternative spellings of one business as one", () => {
    const a = normaliseBusinessName("Joe's Barber Shop, LLC");
    expect(normaliseBusinessName("Joes Barbershop")).toBe(a);
    expect(normaliseBusinessName("JOE’S BARBER SHOP")).toBe(a);
    expect(normaliseBusinessName("Smith & Sons Moving Co.")).toBe(
      normaliseBusinessName("Smith and Sons Moving"),
    );
  });

  it("uses domain, phone and email; ignores social hosts as identity", () => {
    expect(normaliseDomain("https://www.Example-Dental.com/about")).toBe(
      "example-dental.com",
    );
    expect(normaliseDomain("https://facebook.com/joes")).toBeUndefined();
    expect(
      identityKeys({
        name: "Acme Movers",
        city: "Buffalo",
        phone: "+1 (716) 555-0100",
        email: "Hi@Acme.test",
        website: "acme.test",
      }),
    ).toEqual([
      "domain:acme.test",
      "phone:7165550100",
      "email:hi@acme.test",
      "name:acmemovers|buffalo",
    ]);
  });
});

describe("website inquiries", () => {
  const base: InquiryInput = {
    site: "hld",
    contactName: "Pat Example",
    email: "pat@example.test",
    company: "Example Dental",
    industryText: "Dental practice",
    message: "We need a new website.",
    contactConsent: true,
    fillTimeMs: 15_000,
    submittedAt: AT,
    isSynthetic: true,
    landingUrl: "https://hld.example/?utm_source=google&utm_medium=cpc&gclid=abc",
  };

  it("routes to the site's business, attributes the channel, and classifies the industry", () => {
    const p = buildInquiry(base);
    expect(p.routing).toMatchObject({ status: "routed", line: "hld" });
    expect(p.industry_key).toBe("dental");
    expect(p.attribution).toMatchObject({ channel: "google_ads", gclid: "abc" });
    expect(p.spam_reasons).toEqual([]);
    expect(p.identity_keys).toEqual(["email:pat@example.test"]);
  });

  it("contact consent is NOT marketing consent", () => {
    const p = buildInquiry(base);
    expect(p.consent_marketing).toBe(false);
    expect(p.consent_evidence).toMatchObject({
      contact_about_inquiry: true,
      marketing_opt_in: false,
    });
    expect(buildInquiry({ ...base, marketingConsent: true }).consent_marketing).toBe(
      true,
    );
  });

  it("a trucking company on the HLD site is not routed automatically", () => {
    expect(
      buildInquiry({ ...base, industryText: "Trucking and freight" }).routing.status,
    ).toBe("needs_review");
  });

  it("flags spam: honeypot, too fast, many links, spam phrases", () => {
    expect(buildInquiry({ ...base, honeypot: "x" }).spam_reasons).toContain(
      "honeypot field filled",
    );
    expect(buildInquiry({ ...base, fillTimeMs: 400 }).spam_reasons).toContain(
      "form submitted faster than a person can type",
    );
    expect(
      buildInquiry({ ...base, message: "http://a http://b http://c http://d" })
        .spam_reasons[0],
    ).toMatch(/links/);
  });

  it("refuses bad input with every reason", () => {
    try {
      buildInquiry({
        ...base,
        email: "not-an-email",
        contactName: "",
        contactConsent: false,
      });
      throw new Error("expected refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(InquiryValidationError);
      expect((e as InquiryValidationError).problems).toHaveLength(4);
    }
  });

  it("maps the HLD lead record and the HSCS request; HSCS routes/vehicles are marked customer-provided", () => {
    const hld = fromHldLeadRecord(
      {
        organization: { name: "Example Salon", website: null, industry: "Hair salon" },
        contact: { name: "A", email: "a@example.test", phone: null },
        intent: { goals: "More bookings", challenges: null },
        attribution: {},
        consentAcknowledged: true,
      },
      { submittedAt: AT, isSynthetic: true },
    );
    expect(hld).toMatchObject({
      site: "hld",
      marketingConsent: false,
      contactConsent: true,
    });
    const hscs = buildInquiry(
      fromHscsAssessmentRequest(
        {
          name: "B",
          company: "Example Freight",
          email: "b@example.test",
          business_type: "Freight carrier",
          routes_vehicles: "12 trucks, 4 routes",
          contact_consent: true,
          hp_field: "",
        },
        { submittedAt: AT, isSynthetic: true, fillTimeMs: 20_000 },
      ),
    );
    expect(hscs.routing).toMatchObject({ status: "routed", line: "hscs" });
    expect(hscs.industry_key).toBe("transportation");
    expect(hscs.message).toContain(
      "[customer-provided] routes_and_vehicles: 12 trucks, 4 routes",
    );
  });

  it("retries transient failures, never permission errors", async () => {
    let calls = 0;
    const flaky: HlbosRpc = {
      call: <T>() => {
        calls++;
        return calls < 3
          ? Promise.reject(new Error("connection reset"))
          : Promise.resolve({
              status: "routed",
              inquiry_id: "x",
              replayed: false,
            } as T);
      },
      rows: () => Promise.resolve([]),
    };
    await expect(
      submitInquiry(flaky, "svc", "t", buildInquiry(base), {
        sleep: () => Promise.resolve(),
      }),
    ).resolves.toMatchObject({ status: "routed" });
    expect(calls).toBe(3);
    calls = 0;
    const denied: HlbosRpc = {
      call: () => {
        calls++;
        return Promise.reject(new Error("insufficient privilege"));
      },
      rows: () => Promise.resolve([]),
    };
    await expect(
      submitInquiry(denied, "svc", "t", buildInquiry(base), {
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/privilege/);
    expect(calls).toBe(1);
  });
});

describe("Supabase API adapter", () => {
  const calls: string[] = [];
  const fake: SupabaseLike = {
    schema: (s) => ({
      rpc: (fn) => {
        calls.push(`rpc ${s}.${fn}`);
        return Promise.resolve({ data: "ok", error: null });
      },
      from: (t) => ({
        select: () => ({
          match: () => {
            calls.push(`read ${s}.${t}`);
            return Promise.resolve({ data: [{ a: 1 }], error: null });
          },
        }),
      }),
    }),
  };

  it("calls only the allow-listed Revenue Center surface, as the signed-in user", async () => {
    const rpc = supabaseRpc(fake);
    await expect(rpc.call("u", "revenue.send_to_review", {})).resolves.toBe("ok");
    await expect(rpc.rows("u", "revenue.industry_summary", {})).resolves.toEqual([
      { a: 1 },
    ]);
    await expect(rpc.call("u", "comms.approve_message", {})).rejects.toThrow(
      SurfaceError,
    );
    await expect(rpc.call("u", "workflows.decide", {})).rejects.toThrow(SurfaceError);
    await expect(rpc.call("u", "revenue.mock_deliver", {})).rejects.toThrow(
      SurfaceError,
    );
    await expect(rpc.call("u", "revenue.designate_approver", {})).rejects.toThrow(
      SurfaceError,
    );
    await expect(rpc.rows("u", "comms.messages", {})).rejects.toThrow(SurfaceError);
    expect(calls).toEqual([
      "rpc revenue.send_to_review",
      "read revenue.industry_summary",
    ]);
  });

  it("exposes no comms, workflows, identity or platform object", () => {
    for (const x of [...REVENUE_API_SURFACE.functions, ...REVENUE_API_SURFACE.tables])
      expect(x.startsWith("revenue.") || x.startsWith("visibility.")).toBe(true);
  });

  it("surfaces database errors as errors, not empty results", async () => {
    const failing: SupabaseLike = {
      schema: () => ({
        rpc: () =>
          Promise.resolve({ data: null, error: { message: "permission denied" } }),
        from: () => ({
          select: () => ({
            match: () =>
              Promise.resolve({ data: null, error: { message: "permission denied" } }),
          }),
        }),
      }),
    };
    await expect(
      supabaseRpc(failing).rows("u", "revenue.inquiries", {}),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Google Places discovery", () => {
  it("is off unless explicitly enabled, and prices its requests", async () => {
    const src = placesDiscovery({
      enabled: false,
      places: { searchText: () => Promise.reject(new Error("must not be called")) },
      egress: {} as never,
    });
    await expect(
      src.discover(
        CORE_INDUSTRIES[0]!,
        { label: "Buffalo, NY", zip: undefined, radiusMiles: 10 },
        "dentist",
        20,
        0,
      ),
    ).rejects.toThrow(DiscoveryDisabledError);
    expect(src.paidRequestsFor(50)).toBe(3);
    expect(src.estimatedCostCents(3)).toBeGreaterThan(0);
    expect(src.isSynthetic).toBe(false);
  });
});
