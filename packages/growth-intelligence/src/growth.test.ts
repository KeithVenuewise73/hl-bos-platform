import { describe, expect, it } from "vitest";

import {
  AccessDeniedError,
  ApprovalRequiredError,
  FUNNELS,
  LineScopedStore,
  OFFERS,
  approve,
  attribute,
  buildProposal,
  buildReview,
  classifyTouch,
  connectorReadiness,
  entryStage,
  eventsFromPresence,
  execute,
  feedbackReport,
  gbpCreationEligibility,
  growthDashboard,
  lineDashboard,
  routeLead,
  routePresenceLead,
  validateReview,
  type ActionRequest,
  type Campaign,
  type DashboardInput,
  type Principal,
  type PriceBook,
} from "./index.ts";
import { ev, finding, prospect } from "./fixtures.test-helpers.ts";

const owner: Principal = { id: "keith", role: "owner", lines: [] };
const hldLead: Principal = { id: "hld-lead", role: "line_lead", lines: ["hld"] };
const hscsViewer: Principal = {
  id: "hscs-viewer",
  role: "line_viewer",
  lines: ["hscs"],
};
const nobody: Principal = { id: "nobody", role: "line_lead", lines: [] };
const NOW = new Date("2026-11-05T12:00:00.000Z");

const campaigns: Campaign[] = [
  { key: "wny_barbers_50", line: "hld", name: "WNY 50 barbershops", status: "draft" },
  { key: "wny_carriers", line: "hscs", name: "WNY carriers", status: "draft" },
];

// ---------------------------------------------------------------------------
describe("business-line isolation", () => {
  type Rec = { id: string; line: "hld" | "hscs"; name: string };
  const seeded = () => {
    const s = new LineScopedStore<Rec>();
    s.save(owner, { id: "a", line: "hld", name: "Barber" });
    s.save(owner, { id: "b", line: "hscs", name: "Carrier" });
    return s;
  };

  it("a line lead sees only their line", () => {
    const s = seeded();
    expect(s.list(hldLead, "hld").map((r) => r.id)).toEqual(["a"]);
    expect(() => s.list(hldLead, "hscs")).toThrow(AccessDeniedError);
  });

  it("another line's record reads as absent, not forbidden", () => {
    expect(seeded().get(hldLead, "b")).toBeUndefined();
    expect(seeded().get(hscsViewer, "b")?.name).toBe("Carrier");
  });

  it("a viewer cannot write, and an empty grant sees nothing", () => {
    const s = seeded();
    expect(() => s.save(hscsViewer, { id: "c", line: "hscs", name: "x" })).toThrow(
      AccessDeniedError,
    );
    expect(() => s.list(nobody, "hld")).toThrow(AccessDeniedError);
  });

  it("a record cannot be moved to the other line by saving over it", () => {
    expect(() =>
      seeded().save(owner, { id: "a", line: "hscs", name: "moved" }),
    ).toThrow(/cannot be moved/);
  });

  it("consolidated reads are owner-only", () => {
    expect(seeded().listAll(owner)).toHaveLength(2);
    expect(() => seeded().listAll(hldLead)).toThrow(AccessDeniedError);
  });

  it("returned records are copies: mutating one does not change the store", () => {
    const s = seeded();
    s.list(owner, "hld")[0]!.name = "tampered";
    expect(s.get(owner, "a")?.name).toBe("Barber");
  });

  it("offers never cross lines", () => {
    for (const o of OFFERS) expect(o.key.startsWith(`${o.line}.`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("campaign routing", () => {
  const base = {
    origin: "discovered" as const,
    campaignKey: undefined,
    inboundSite: undefined,
    vertical: undefined,
    industry: undefined,
  };

  it("the campaign decides first", () => {
    const r = routeLead(
      { ...base, campaignKey: "wny_carriers", industry: "Trucking company" },
      campaigns,
    );
    expect(r).toMatchObject({ status: "routed", line: "hscs", basis: "campaign" });
  });

  it("an unregistered campaign is not guessed", () => {
    expect(routeLead({ ...base, campaignKey: "ghost" }, campaigns).status).toBe(
      "needs_review",
    );
  });

  it("the inbound website decides for inquiries", () => {
    const r = routeLead(
      {
        ...base,
        origin: "inbound_inquiry",
        inboundSite: "hld",
        industry: "Hair salon",
      },
      campaigns,
    );
    expect(r).toMatchObject({ status: "routed", line: "hld", basis: "inbound_site" });
  });

  it("a trucking company on the HLD site goes to a person, not silently to either line", () => {
    const r = routeLead(
      { ...base, origin: "inbound_inquiry", inboundSite: "hld", industry: "Trucking" },
      campaigns,
    );
    expect(r.status).toBe("needs_review");
    if (r.status === "needs_review")
      expect(r.candidates.sort()).toEqual(["hld", "hscs"]);
  });

  it("campaign and website disagreeing goes to a person", () => {
    const r = routeLead(
      { ...base, campaignKey: "wny_barbers_50", inboundSite: "hscs" },
      campaigns,
    );
    expect(r.status).toBe("needs_review");
  });

  it("industry alone routes when it is unambiguous", () => {
    expect(
      routeLead({ ...base, industry: "Freight & logistics" }, campaigns),
    ).toMatchObject({ line: "hscs", basis: "industry" });
    expect(routeLead({ ...base, vertical: "contractor" }, campaigns)).toMatchObject({
      line: "hld",
    });
  });

  it("whole words only: 'barber' is not 'bar', 'delivery' alongside a restaurant is ambiguous", () => {
    expect(routeLead({ ...base, industry: "Barber shop" }, campaigns)).toMatchObject({
      line: "hld",
    });
    expect(
      routeLead({ ...base, industry: "Pizza restaurant delivery" }, campaigns).status,
    ).toBe("needs_review");
  });

  it("nothing recognisable goes to a person", () => {
    expect(routeLead({ ...base, industry: "Widgets" }, campaigns).status).toBe(
      "needs_review",
    );
  });

  it("a Presence Scanner lead routes through its vertical", () => {
    expect(routePresenceLead(prospect()).routing).toMatchObject({
      status: "routed",
      line: "hld",
    });
  });

  it("the funnels are the brief's, in order, and map onto the HL-BOS stage enum", () => {
    expect(FUNNELS.hld.stages.map((s) => s.label)).toEqual([
      "Discovery",
      "AI Digital Review",
      "Qualified Prospect",
      "In CRM",
      "Personalized Proposal",
      "Consultation",
      "Signed Agreement",
      "Implementation",
      "Recurring Subscription",
    ]);
    expect(FUNNELS.hscs.stages.map((s) => s.label)).toEqual([
      "Discovery",
      "Transportation Opportunity Review",
      "Qualified Prospect",
      "In CRM",
      "Operational Assessment Offer",
      "Consultation",
      "Consulting Agreement",
      "Software Recommendation",
      "Ongoing Engagement",
    ]);
    const enumValues = ["prospect", "assessed", "proposed", "client", "lost"];
    for (const f of Object.values(FUNNELS))
      for (const s of f.stages) expect(enumValues).toContain(s.hlbosStage);
  });

  it("inbound and referral leads enter at the CRM stage and count as generate_lead", () => {
    expect(entryStage("hscs", "referral")).toMatchObject({
      key: "crm",
      ga4Event: "generate_lead",
    });
    expect(entryStage("hld", "discovered").key).toBe("discovery");
  });
});

// ---------------------------------------------------------------------------
describe("opportunity reviews", () => {
  it("separates observed facts, things not checked, things needing verification, and assumptions", () => {
    const r = buildReview(prospect(), { line: "hld", now: NOW });
    expect(r.observed.map((f) => f.key).sort()).toEqual([
      "conv.booking",
      "site.mobile",
    ]);
    expect(r.notChecked).toHaveLength(1);
    expect(r.needsVerification).toHaveLength(1);
    expect(r.assumptions.length).toBeGreaterThan(0);
    expect(validateReview(r)).toEqual([]);
  });

  it("offers only what an observed gap supports", () => {
    const r = buildReview(prospect(), { line: "hld", now: NOW });
    // Lead Generation -> booking (backed by conv.booking). Reputation has no
    // observed evidence (review count was not checked), so it is NOT offered.
    expect(r.opportunities.map((o) => o.offerKey)).toEqual(["hld.booking"]);
    expect(r.opportunities[0]!.basedOn).toEqual(["conv.booking"]);
  });

  it("HSCS: public indicators become facts; private figures are refused unless the customer gave them", () => {
    const r = buildReview(prospect({ name: "WNY Carrier" }), {
      line: "hscs",
      now: NOW,
      publicIndicators: [
        {
          key: "public.dot_number",
          label: "USDOT number shown on website",
          evidence: "Footer reads 'USDOT 1234567'",
          source: "website",
          observedAt: NOW.toISOString(),
          suggests: ["hscs.dvir", "hscs.fleet"],
        },
      ],
    });
    expect(r.opportunities[0]!.offerKey).toBe("hscs.assessment");
    expect(r.opportunities.map((o) => o.offerKey)).toContain("hscs.dvir");
    expect(validateReview(r)).toEqual([]);

    const invented = {
      ...r,
      observed: [
        ...r.observed,
        {
          key: "fleet_size",
          label: "Fleet size",
          status: "present" as const,
          source: "website" as const,
          observedAt: NOW.toISOString(),
          evidence: "about 40 trucks",
          confidence: "low" as const,
        },
      ],
    };
    expect(validateReview(invented).join(" ")).toMatch(/private operating data/);

    const provided = {
      ...invented,
      observed: invented.observed.map((f) =>
        f.key === "fleet_size" ? { ...f, source: "customer_provided" as const } : f,
      ),
    };
    expect(validateReview(provided)).toEqual([]);
  });

  it("rejects an opportunity citing a fact that was never observed, another line's offer, or a promise", () => {
    const r = buildReview(prospect(), { line: "hld", now: NOW });
    const bad = {
      ...r,
      opportunities: [
        {
          offerKey: "hld.website",
          offerName: "Website",
          priority: "high" as const,
          rationale: "We guarantee first page on Google",
          basedOn: ["made.up"],
        },
        {
          offerKey: "hscs.dvir",
          offerName: "DVIR",
          priority: "low" as const,
          rationale: "x",
          basedOn: ["conv.booking"],
        },
      ],
    };
    const problems = validateReview(bad).join(" | ");
    expect(problems).toMatch(/was not observed/);
    expect(problems).toMatch(/other business line/);
    expect(problems).toMatch(/promise/);
  });
});

// ---------------------------------------------------------------------------
describe("proposals", () => {
  const review = () => buildReview(prospect(), { line: "hld", now: NOW });
  const book: PriceBook = {
    line: "hld",
    oneTimeCents: { "hld.booking": 50_000 },
    monthlyCents: { "hld.booking": 0, "hld.hosting": 4_900 },
    approvedBy: "keith",
    approvedAt: NOW.toISOString(),
  };

  it("is blocked, with the reason, until the owner sets prices", () => {
    const p = buildProposal(review());
    expect(p.status).toBe("blocked");
    expect(p.blockedReasons.join(" ")).toMatch(/No price has been set for "Booking/);
    expect(p.totalOneTimeCents).toBeNull();
  });

  it("is ready for approval — never sent — once priced, and has every required section", () => {
    const p = buildProposal(review(), { priceBook: book });
    expect(p.status).toBe("ready_for_approval");
    expect(p.requiresApproval).toBe(true);
    expect(p.totalOneTimeCents).toBe(50_000);
    expect(p.totalMonthlyCents).toBe(0);
    expect(p.currentSituation.length).toBeGreaterThan(0);
    expect(p.problemOrOpportunity[0]).toMatch(
      /estimated opportunity, not a measured result/,
    );
    expect(p.expectedBenefits.length).toBeGreaterThan(0);
    expect(p.alternatives.some((a) => /free of charge/.test(a))).toBe(true);
    expect(p.assumptionsAndLimitations.join(" ")).toMatch(/not a promise of revenue/);
  });

  it("a recurring offer needs a monthly price; a one-time offer needs a one-time price", () => {
    const p = buildProposal(review(), {
      include: ["hld.booking", "hld.reputation"],
      priceBook: book,
    });
    expect(p.status).toBe("blocked");
    expect(p.blockedReasons.join(" ")).toMatch(/Reputation management/);
  });

  it("refuses the other line's price book and the other line's offers", () => {
    const p = buildProposal(review(), {
      include: ["hld.booking", "hscs.dvir"],
      priceBook: { ...book, line: "hscs" },
    });
    expect(p.blockedReasons.join(" ")).toMatch(
      /price book belongs to the other business line/,
    );
    expect(p.blockedReasons.join(" ")).toMatch(/belongs to the other business line/);
  });

  it("is blocked when the review it is built on is dishonest", () => {
    const r = review();
    const p = buildProposal({ ...r, assumptions: [] }, { priceBook: book });
    expect(p.status).toBe("blocked");
  });
});

// ---------------------------------------------------------------------------
describe("approval gate", () => {
  const req: ActionRequest = {
    id: "r1",
    kind: "send_proposal",
    line: "hld",
    payload: { text: "Proposal v1" },
    requestedBy: "hld-lead",
    requestedAt: NOW.toISOString(),
  };

  it("nothing runs without approval", async () => {
    let ran = false;
    await expect(
      execute(req, undefined, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow(ApprovalRequiredError);
    expect(ran).toBe(false);
  });

  it("only the owner can approve", () => {
    expect(() => approve(req, hldLead, NOW)).toThrow(ApprovalRequiredError);
  });

  it("an approval is void if the content changes afterwards", async () => {
    const a = approve(req, owner, NOW);
    await expect(
      execute({ ...req, payload: { text: "Proposal v2" } }, a, () =>
        Promise.resolve(1),
      ),
    ).rejects.toThrow(/changed after it was approved/);
    await expect(execute(req, a, () => Promise.resolve(1))).resolves.toBe(1);
  });

  it("outreach cannot be approved without a consent record", () => {
    expect(() => approve({ ...req, kind: "send_outreach" }, owner, NOW)).toThrow(
      /lawful basis/,
    );
    expect(
      approve({ ...req, kind: "send_outreach", consentRef: "consent-1" }, owner, NOW)
        .approvedBy,
    ).toBe("keith");
  });
});

// ---------------------------------------------------------------------------
describe("attribution", () => {
  const at = NOW.toISOString();

  it("classifies each channel from what the browser sent", () => {
    const c = (landingUrl: string | undefined, referrer?: string) =>
      classifyTouch({ landingUrl, referrer, at }).channel;
    expect(c("https://hld.test/?gclid=abc")).toBe("google_ads");
    expect(
      c("https://hld.test/?utm_source=google&utm_medium=organic&utm_campaign=gbp"),
    ).toBe("google_business_profile");
    expect(c("https://hld.test/?utm_source=google&utm_medium=cpc")).toBe("google_ads");
    expect(c("https://hld.test/?utm_source=outreach&utm_medium=email")).toBe(
      "discovery_outreach",
    );
    expect(c("https://hld.test/", "https://www.google.com/")).toBe("google_organic");
    expect(c("https://hld.test/", "https://m.facebook.com/")).toBe("social");
    expect(c("https://hld.test/", "https://chamber.example/")).toBe("referral");
    expect(c("https://hld.test/")).toBe("direct");
    expect(c(undefined)).toBe("unknown");
    expect(c("not a url")).toBe("unknown");
  });

  it("last touch skips a later direct visit", () => {
    const a = attribute([
      {
        landingUrl: "https://hld.test/",
        referrer: "https://www.google.com/",
        at: "2026-10-01T00:00:00Z",
      },
      {
        landingUrl: "https://hld.test/?gclid=x",
        referrer: undefined,
        at: "2026-10-02T00:00:00Z",
      },
      {
        landingUrl: "https://hld.test/contact",
        referrer: undefined,
        at: "2026-10-03T00:00:00Z",
      },
    ]);
    expect(a.firstTouch?.channel).toBe("google_organic");
    expect(a.lastTouch?.channel).toBe("google_ads");
  });
});

// ---------------------------------------------------------------------------
describe("Google integrations", () => {
  it("nothing is connected without a credential AND a recent successful call", () => {
    const r = connectorReadiness(
      [
        {
          key: "google_business",
          hasCredential: true,
          lastSuccessAt: undefined,
          lastError: undefined,
        },
        {
          key: "google_search_console",
          hasCredential: true,
          lastSuccessAt: "2026-11-04T00:00:00Z",
          lastError: undefined,
        },
        {
          key: "google_ads",
          hasCredential: true,
          lastSuccessAt: "2026-10-01T00:00:00Z",
          lastError: undefined,
        },
        {
          key: "pagespeed",
          hasCredential: true,
          lastSuccessAt: "2026-11-04T00:00:00Z",
          lastError: "quota exceeded",
        },
      ],
      NOW,
    );
    const s = Object.fromEntries(r.map((x) => [x.connector.key, x.status]));
    expect(s).toEqual({
      google_business: "not_tested",
      google_search_console: "connected",
      google_analytics_4: "not_connected",
      google_ads: "not_tested",
      pagespeed: "failing",
    });
  });

  it("requests read-only scopes wherever read-only exists", () => {
    const r = connectorReadiness([], NOW);
    const scopes = r.flatMap((x) => x.connector.scopes);
    expect(scopes).toContain("https://www.googleapis.com/auth/webmasters.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(scopes).not.toContain("https://www.googleapis.com/auth/webmasters");
  });

  it("a Business Profile is never created on unanswered or failing eligibility", () => {
    const all = {
      inPersonContact: true,
      hasStaffedLocationOrServiceArea: true,
      isVirtualOfficeOrMailbox: false,
      ownerAuthorisesCreation: true,
      answeredBy: "keith",
    };
    expect(gbpCreationEligibility(all).eligible).toBe(true);
    expect(gbpCreationEligibility({ ...all, answeredBy: undefined }).eligible).toBe(
      false,
    );
    expect(
      gbpCreationEligibility({ ...all, isVirtualOfficeOrMailbox: true }).eligible,
    ).toBe(false);
    expect(
      gbpCreationEligibility({ ...all, inPersonContact: undefined }).eligible,
    ).toBe(false);
    expect(
      gbpCreationEligibility({ ...all, ownerAuthorisesCreation: false }).eligible,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("growth dashboard", () => {
  const input = (
    events: DashboardInput["events"],
    expenses: DashboardInput["expenses"] = [],
  ): DashboardInput => ({
    events,
    expenses,
    connectors: connectorReadiness([], NOW),
    now: NOW,
  });
  const metric = (d: ReturnType<typeof lineDashboard>, key: string) =>
    d.metrics.find((m) => m.key === key)!;

  it("with no records, every metric says no data — none shows a zero", () => {
    const d = lineDashboard(owner, "hld", input([]));
    for (const m of d.metrics) {
      expect(m.value).toBeNull();
      expect(m.note.length).toBeGreaterThan(0);
    }
  });

  it("demo records are excluded and counted, never shown as results", () => {
    const d = lineDashboard(
      owner,
      "hld",
      input([
        ev({ kind: "discovered", leadId: "x", isDemo: true }),
        ev({
          kind: "agreement_signed",
          leadId: "x",
          isDemo: true,
          implementationCents: 999_00,
          monthlyCents: 99_00,
        }),
      ]),
    );
    expect(d.demoRecordsExcluded).toBe(2);
    expect(metric(d, "signed").value).toBeNull();
    expect(metric(d, "signed").note).toMatch(/demonstration/);
    expect(metric(d, "mrr").value).toBeNull();
  });

  it("counts real records per line and keeps lines apart", () => {
    const events = [
      ev({ kind: "discovered", leadId: "a" }),
      ev({ kind: "qualified", leadId: "a" }),
      ev({ kind: "proposal_sent", leadId: "a" }),
      ev({
        kind: "agreement_signed",
        leadId: "a",
        implementationCents: 150_000,
        monthlyCents: 9_900,
      }),
      ev({ kind: "discovered", leadId: "t", line: "hscs" }),
    ];
    const [hld, hscs, all] = growthDashboard(owner, input(events));
    expect(metric(hld!, "signed").value).toBe(1);
    expect(metric(hld!, "mrr").value).toBe(9_900);
    expect(metric(hld!, "conv_proposal_signed").value).toBe(1);
    expect(metric(hscs!, "signed").value).toBe(0);
    expect(metric(hscs!, "discovered").value).toBe(1);
    expect(metric(all!, "discovered").value).toBe(2);
  });

  it("CAC is not zero when no spend is recorded — it is not supported", () => {
    const d = lineDashboard(
      owner,
      "hld",
      input([
        ev({
          kind: "agreement_signed",
          leadId: "a",
          implementationCents: 1,
          monthlyCents: 1,
        }),
      ]),
    );
    expect(metric(d, "cac")).toMatchObject({ value: null, status: "not_supported" });
    const withSpend = lineDashboard(
      owner,
      "hld",
      input(
        [
          ev({
            kind: "agreement_signed",
            leadId: "a",
            implementationCents: 1,
            monthlyCents: 1,
          }),
        ],
        [
          {
            id: "x",
            line: "hld",
            channel: "google_ads",
            campaignKey: "c",
            cents: 30_000,
            at: "2026-10-01",
            isDemo: false,
          },
        ],
      ),
    );
    expect(metric(withSpend, "cac")).toMatchObject({
      value: 30_000,
      status: "measured",
    });
  });

  it("revenue is not totalled when an agreement has no amount recorded", () => {
    const d = lineDashboard(
      owner,
      "hld",
      input([ev({ kind: "agreement_signed", leadId: "a" })]),
    );
    expect(metric(d, "implementation_revenue")).toMatchObject({
      value: null,
      status: "not_supported",
    });
  });

  it("LTV needs enough customers, history and observed churn", () => {
    const d = lineDashboard(
      owner,
      "hld",
      input([
        ev({
          kind: "agreement_signed",
          leadId: "a",
          implementationCents: 1,
          monthlyCents: 1,
        }),
      ]),
    );
    expect(metric(d, "ltv").status).toBe("not_supported");
  });

  it("a kind no connected source records is unknown, not a measured zero", () => {
    const d = lineDashboard(owner, "hld", {
      ...input([ev({ kind: "discovered", leadId: "a" })]),
      capturedKinds: ["discovered"],
    });
    expect(metric(d, "discovered")).toMatchObject({ value: 1, status: "measured" });
    expect(metric(d, "inbound")).toMatchObject({
      value: null,
      status: "not_connected",
    });
  });

  it("Google metrics say not connected rather than showing a number", () => {
    const d = lineDashboard(
      owner,
      "hld",
      input([ev({ kind: "discovered", leadId: "a" })]),
    );
    expect(metric(d, "website_visits")).toMatchObject({
      value: null,
      status: "not_connected",
    });
  });

  it("is owner-only for consolidated, and line-scoped otherwise", () => {
    expect(() => growthDashboard(hldLead, input([]))).toThrow(AccessDeniedError);
    expect(() => lineDashboard(hldLead, "hscs", input([]))).toThrow(AccessDeniedError);
    expect(() => lineDashboard(hldLead, "hld", input([]))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe("feedback loop", () => {
  it("draws no conclusion below the minimum sample", () => {
    const events = [
      ev({ kind: "proposal_sent", leadId: "a" }),
      ev({ kind: "agreement_signed", leadId: "a" }),
    ];
    const r = feedbackReport(owner, "hld", events, []);
    expect(r.industryConversion[0]).toMatchObject({
      attempts: 1,
      wins: 1,
      sufficient: false,
    });
    expect(r.recommendations).toEqual([]);
  });

  it("recommends from sufficient evidence, and every recommendation needs approval", () => {
    const events = [];
    for (let i = 0; i < 6; i++) {
      events.push(
        ev({
          kind: "proposal_sent",
          leadId: `w${i}`,
          industry: "Barber",
          services: ["hld.booking", "hld.crm"],
        }),
      );
      if (i < 4)
        events.push(
          ev({
            kind: "agreement_signed",
            leadId: `w${i}`,
            industry: "Barber",
            services: ["hld.booking"],
          }),
        );
      events.push(
        ev({
          kind: "capability_requested",
          leadId: `w${i}`,
          note: "Text-message reminders",
        }),
      );
    }
    const r = feedbackReport(owner, "hld", events, []);
    const texts = r.recommendations.map((x) => x.text);
    expect(texts).toContain("Focus discovery on Barber.");
    expect(texts.some((t) => t.includes('"hld.crm"'))).toBe(true);
    expect(texts.some((t) => t.includes("text-message reminders"))).toBe(true);
    expect(r.recommendations.every((x) => x.requiresApproval)).toBe(true);
  });

  it("is owner-only and ignores demo records", () => {
    expect(() => feedbackReport(hldLead, "hld", [], [])).toThrow(AccessDeniedError);
    const r = feedbackReport(
      owner,
      "hld",
      [ev({ kind: "proposal_sent", leadId: "d", isDemo: true })],
      [],
    );
    expect(r.demoRecordsExcluded).toBe(1);
    expect(r.industryConversion).toEqual([]);
  });

  it("counts the problems reviews find most often", () => {
    const r1 = buildReview(prospect(), { line: "hld", now: NOW });
    const r2 = buildReview(
      prospect({
        id: "lead-2",
        findings: [finding("conv.booking", "not_found", "Online booking")],
      }),
      { line: "hld", now: NOW },
    );
    const r = feedbackReport(owner, "hld", [], [r1, r2]);
    expect(r.frequentProblems[0]).toEqual({ label: "online booking", count: 2 });
  });
});

// ---------------------------------------------------------------------------
describe("Presence Scanner adapter", () => {
  it("derives events only from what the lead's audit trail recorded", () => {
    const p = prospect({
      audit: [
        {
          at: "2026-10-10T00:00:00Z",
          by: "keith",
          action: "stage",
          detail: "Qualified → Contacted",
        },
        {
          at: "2026-10-20T00:00:00Z",
          by: "keith",
          action: "stage",
          detail: "Contacted → Lost: went with a cousin's nephew",
        },
        {
          at: "2026-10-21T00:00:00Z",
          by: "keith",
          action: "note",
          detail: "Client mentioned",
        },
      ],
    });
    const kinds = eventsFromPresence(routePresenceLead(p)).map((e) => e.kind);
    expect(kinds).toEqual([
      "discovered",
      "review_completed",
      "qualified",
      "outreach_sent",
      "deal_lost",
    ]);
    const lost = eventsFromPresence(routePresenceLead(p)).find(
      (e) => e.kind === "deal_lost",
    );
    expect(lost?.lostReason).toBe("went with a cousin's nephew");
    expect(
      eventsFromPresence(routePresenceLead(p)).every(
        (e) => e.line === "hld" && !e.isDemo,
      ),
    ).toBe(true);
  });

  it("an unrouted lead produces no events", () => {
    const p = prospect({ vertical: "professional_services" });
    const routed = routePresenceLead(p);
    // Professional services is an HLD vertical, so it routes; force ambiguity:
    const ambiguous = {
      ...routed,
      routing: { status: "needs_review" as const, candidates: [], reasons: [] },
    };
    expect(eventsFromPresence(ambiguous)).toEqual([]);
  });
});
