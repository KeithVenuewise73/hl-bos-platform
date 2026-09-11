import { describe, it, expect } from "vitest";
import {
  ASSEMBLE_SQL,
  DECIDE_SQL,
  DRAFT_SQL,
  PROPOSALS_SQL,
  PROPOSAL_SQL,
  SAVE_SQL,
  SEND_SQL,
  toAssembleContext,
  toDocument,
  toStatus,
  toSummary,
} from "./proposal-sql";
import type { ProposalDocument } from "./proposal-doc";

const ID = "11111111-1111-1111-1111-111111111111";
const DOC: ProposalDocument = {
  shop: { name: "Truth Barbershop", locality: null, website_url: null, phone: null },
  prepared_by: "Herman Legacy Digital",
  prepared_at: "2026-09-11T12:00:00Z",
  message: "",
  audit: null,
  call: null,
  offer: [
    {
      capability: "owned_website",
      name: "Owned Website",
      because: "b",
      recovers: "r",
      deliverable_today: true,
      needs_confirming: false,
    },
  ],
  investment: { lines: [], note: "" },
  next_steps: [],
};

describe("every write goes through the front door", () => {
  it("assumes the tenant owner rather than writing as the superuser", () => {
    // The SQL endpoint connects as postgres, which bypasses RLS and every
    // permission check. Writing that way would let the console store what the
    // application itself would refuse.
    for (const sql of [
      DRAFT_SQL("hld", ID, null, DOC),
      SAVE_SQL("hld", ID, DOC),
      SEND_SQL("hld", ID),
      DECIDE_SQL("hld", ID, "accepted", ""),
    ]) {
      expect(sql).toContain("set local role authenticated");
      expect(sql).toContain("refusing to write as a superuser");
      expect(sql).toContain("reset role");
    }
  });

  it("calls the permission-checked function, never the table", () => {
    expect(DRAFT_SQL("hld", ID, null, DOC)).toContain("transform_audit.draft_proposal");
    expect(SAVE_SQL("hld", ID, DOC)).toContain("transform_audit.save_proposal");
    expect(SEND_SQL("hld", ID)).toContain("transform_audit.send_proposal");
    expect(DECIDE_SQL("hld", ID, "declined", "")).toContain(
      "transform_audit.decide_proposal",
    );
    for (const sql of [DRAFT_SQL("hld", ID, null, DOC), SAVE_SQL("hld", ID, DOC)]) {
      expect(sql).not.toMatch(/insert\s+into\s+transform_audit\.proposals/i);
      expect(sql).not.toMatch(/update\s+transform_audit\.proposals/i);
    }
  });

  it("passes a missing audit as a real null, not the string 'null'", () => {
    expect(DRAFT_SQL("hld", ID, null, DOC)).toContain("    null,");
    expect(DRAFT_SQL("hld", ID, "22222222-2222-2222-2222-222222222222", DOC)).toContain(
      "'22222222-2222-2222-2222-222222222222'::uuid",
    );
  });

  it("sends no decision note rather than an empty one", () => {
    expect(DECIDE_SQL("hld", ID, "accepted", "")).toContain("'accepted',\n    null");
    expect(DECIDE_SQL("hld", ID, "accepted", "said yes")).toContain("'said yes'");
  });

  it("escapes a quote in free text rather than breaking out of the statement", () => {
    const sql = DECIDE_SQL("hld", ID, "declined", "O'Brien said 'no'");
    // Every quote in the note is doubled, so none of them can close the literal.
    expect(sql).toContain("'O''Brien said ''no'''");
  });

  it("escapes a quote inside the document's own words", () => {
    const sql = SAVE_SQL("hld", ID, { ...DOC, message: "He said 'they never call'" });
    const body = sql.slice(sql.indexOf("save_proposal"));
    const literal = body.slice(body.indexOf("'{"), body.indexOf("}'") + 2);
    expect(literal.match(/(?<!')'(?!')/g)).toHaveLength(2); // just the delimiters
  });
});

describe("every read is scoped to this agency", () => {
  it("filters by tenant, because the endpoint bypasses RLS", () => {
    for (const sql of [
      ASSEMBLE_SQL("herman-legacy-digital", ID),
      PROPOSALS_SQL("herman-legacy-digital", ID),
      PROPOSAL_SQL("herman-legacy-digital", ID),
    ]) {
      expect(sql).toContain("'herman-legacy-digital'");
      expect(sql).toContain("(select id from t)");
    }
  });

  it("takes only a finished audit, not one still running", () => {
    expect(ASSEMBLE_SQL("hld", ID)).toContain(
      "r.status in ('completed','partially_completed')",
    );
  });

  it("leaves unknown-confidence findings out of the document", () => {
    // An 'unknown' finding records that we could NOT observe something. It is
    // useful to the audit and is not a sentence to put in front of a shop as
    // though it were a discovery about them.
    expect(ASSEMBLE_SQL("hld", ID)).toContain("f.confidence <> 'unknown'");
  });
});

describe("reading a stored proposal back", () => {
  it("reads a status it recognises", () => {
    expect(toStatus("sent")).toBe("sent");
    expect(toStatus("accepted")).toBe("accepted");
  });

  it("treats anything it does not recognise as a draft", () => {
    // Under-reading leaves a sent document looking un-sent, which is
    // recoverable. Over-reading would show a draft as sent and stop anyone
    // sending the real thing.
    for (const v of ["posted", "", null, 7]) expect(toStatus(v)).toBe("draft");
  });

  it("parses a document whether the driver gives an object or a string", () => {
    const asObject = toDocument({ shop: { name: "A Shop" }, offer: [] });
    const asString = toDocument(
      JSON.stringify({ shop: { name: "A Shop" }, offer: [] }),
    );
    expect(asObject.shop.name).toBe("A Shop");
    expect(asString.shop.name).toBe("A Shop");
  });

  it("claims deliverable_today ONLY for an exact boolean true", () => {
    // A transport that stringified the booleans must not be read as a promise.
    // Under-promising is a slower sale; over-promising is a contract we cannot
    // honour.
    const d = toDocument({
      offer: [
        { capability: "a", deliverable_today: true },
        { capability: "b", deliverable_today: "true" },
        { capability: "c" },
      ],
    });
    expect(d.offer.map((o) => o.deliverable_today)).toEqual([true, false, false]);
  });

  it("drops an offer line that names no capability rather than inventing one", () => {
    const d = toDocument({
      offer: [{ name: "Something" }, null, "nonsense", { capability: "ok" }],
    });
    expect(d.offer.map((o) => o.capability)).toEqual(["ok"]);
  });

  it("survives a document with nothing in it", () => {
    const d = toDocument(null);
    expect(d.offer).toEqual([]);
    expect(d.audit).toBeNull();
    expect(d.call).toBeNull();
    expect(d.investment.lines).toEqual([]);
    expect(d.shop.name).toBe("This shop");
  });

  it("keeps a recorded call's three states apart", () => {
    const d = toDocument({
      offer: [],
      call: {
        answered_at: "2026-09-11T12:00:00Z",
        said: [{ label: "A website of your own", answer: "no" }],
        not_asked: ["something catches a call you miss"],
        notes: "",
      },
    });
    expect(d.call!.said[0]!.answer).toBe("no");
    expect(d.call!.not_asked).toHaveLength(1);
  });

  it("counts the offer when the summary row does not carry a count", () => {
    expect(toSummary({ id: ID, status: "draft", offer_lines: 3 }).offerLines).toBe(3);
    expect(
      toSummary({ id: ID, status: "draft", document: { offer: [1, 2] } }).offerLines,
    ).toBe(2);
  });
});

describe("assembling from live data", () => {
  const ROW = {
    business_name: "Truth Barbershop",
    phone: "716-939-3443",
    locality: "West Seneca",
    run_id: "33333333-3333-3333-3333-333333333333",
    run_at: "2026-09-01T00:00:00+00:00",
    composite_score: 41,
    dimensions_scored: 2,
    dimensions_possible: 4,
    findings: [
      {
        code: "no_ssl",
        dimension: "website",
        statement: "The site is served over http",
        evidence_url: "http://x.test",
        confidence: "verified",
        severity: "high",
      },
    ],
    answered_at: "2026-09-11T12:00:00+00:00",
    own_website: false,
    booking_platform: "GlossGenius",
    online_booking: true,
    missed_call_handling: null,
    chairs: 3,
    notes: "Owner answers the phone himself.",
  };

  it("carries the audit and its coverage", () => {
    const c = toAssembleContext(ROW);
    expect(c.audit!.composite).toBe(41);
    expect(c.audit!.coverage).toEqual({ scored: 2, possible: 4 });
    expect(c.audit!.findings).toHaveLength(1);
  });

  it("reports NO audit when there is no run, rather than an empty one", () => {
    // An empty scorecard reads as "we looked and found nothing wrong". Null
    // makes the document say no audit was run.
    expect(toAssembleContext({ ...ROW, run_id: null }).audit).toBeNull();
  });

  it("keeps an unasked question null rather than false", () => {
    const c = toAssembleContext(ROW);
    expect(c.stack.ownWebsite).toBe(false);
    expect(c.stack.missedCallHandling).toBeNull();
    expect(c.stack.reviewProcess).toBeNull();
  });

  it("survives a shop nobody has audited or called", () => {
    const c = toAssembleContext({ business_name: "A Shop" });
    expect(c.audit).toBeNull();
    expect(c.answeredAt).toBeNull();
    expect(Object.values(c.stack).every((v) => v === null)).toBe(true);
  });
});
