import { describe, it, expect } from "vitest";
import {
  ANSWER_KEYS,
  CALL_SQL,
  RECORD_CALL_SQL,
  answersPayload,
  toCallContext,
  tri,
} from "./discovery-sql";

describe("three-state answers survive the transport", () => {
  it("keeps true, false and 'nobody asked' apart", () => {
    // The whole proposal rests on this. A transport that turned NULL into
    // false would make the console assert things nobody said.
    expect(tri(true)).toBe(true);
    expect(tri(false)).toBe(false);
    expect(tri(null)).toBeNull();
    expect(tri(undefined)).toBeNull();
  });

  it("reads the string forms the two runners disagree about", () => {
    // node-postgres gives booleans; the Management API's JSON gives strings.
    // Both sit behind this code and a silently-wrong false would be a claim.
    expect(tri("true")).toBe(true);
    expect(tri("t")).toBe(true);
    expect(tri("false")).toBe(false);
    expect(tri("f")).toBe(false);
  });

  it("treats anything it does not recognise as unasked, never as false", () => {
    for (const v of ["", "yes", 1, 0, {}, []]) expect(tri(v)).toBeNull();
  });
});

describe("mapping a row to the call screen", () => {
  const ROW = {
    business_name: "Truth Barbershop",
    phone: "716-939-3443",
    locality: "West Seneca",
    answered_at: "2026-09-11T12:00:00+00:00",
    own_website: false,
    booking_platform: "GlossGenius",
    online_booking: true,
    missed_call_handling: null,
    review_process: null,
    client_records: null,
    takes_walkins: null,
    chairs: 3,
    notes: "Owner answers the phone himself.",
    catalog: [
      {
        key: "owned_website",
        name: "Owned Website",
        status: "available",
        description: "",
      },
      { key: "booking", name: "Booking", status: "planned", description: "" },
    ],
  };

  it("carries what was said and what was not", () => {
    const c = toCallContext(ROW);
    expect(c.shopName).toBe("Truth Barbershop");
    expect(c.stack.ownWebsite).toBe(false);
    expect(c.stack.bookingPlatform).toBe("GlossGenius");
    expect(c.stack.missedCallHandling).toBeNull();
    expect(c.stack.chairs).toBe(3);
  });

  it("knows whether anyone has actually called", () => {
    expect(toCallContext(ROW).answeredAt).not.toBeNull();
    expect(toCallContext({ ...ROW, answered_at: null }).answeredAt).toBeNull();
  });

  it("survives a row where nothing has been recorded at all", () => {
    // The left joins produce nulls for every discovery column before a call.
    const c = toCallContext({ business_name: "A Shop", catalog: [] });
    expect(c.shopName).toBe("A Shop");
    expect(c.answeredAt).toBeNull();
    expect(c.notes).toBe("");
    expect(Object.values(c.stack).every((v) => v === null)).toBe(true);
  });

  it("reads chairs whether the driver gives a number or a string", () => {
    expect(toCallContext({ ...ROW, chairs: "4" }).stack.chairs).toBe(4);
    expect(toCallContext({ ...ROW, chairs: "many" }).stack.chairs).toBeNull();
  });
});

describe("the catalog comes from the database, not from this app", () => {
  it("maps what the database offers", () => {
    const c = toCallContext({
      business_name: "x",
      catalog: [
        { key: "booking", name: "Booking", status: "planned", description: "d" },
      ],
    });
    expect(c.catalog).toHaveLength(1);
    expect(c.catalog[0]!.status).toBe("planned");
  });

  it("treats an unrecognised status as planned, never as available", () => {
    // Under-promising costs a slower sale. Over-promising costs a contract we
    // cannot honour.
    const c = toCallContext({
      business_name: "x",
      catalog: [{ key: "k", name: "K", status: "experimental", description: "" }],
    });
    expect(c.catalog[0]!.status).toBe("planned");
  });

  it("drops a malformed catalog entry rather than inventing a key", () => {
    const c = toCallContext({
      business_name: "x",
      catalog: [
        { name: "no key here" },
        null,
        "nonsense",
        { key: "ok", status: "available" },
      ],
    });
    expect(c.catalog.map((x) => x.key)).toEqual(["ok"]);
  });

  it("copes with no catalog at all", () => {
    expect(toCallContext({ business_name: "x", catalog: null }).catalog).toEqual([]);
  });
});

describe("the save payload preserves absent-versus-null", () => {
  it("sends only the keys it was given", () => {
    // An absent key leaves the stored answer alone, which is what makes a
    // partial call safe. Sending every key every time would wipe earlier calls.
    const p = answersPayload({ online_booking: true });
    expect(Object.keys(p)).toEqual(["online_booking"]);
  });

  it("passes an explicit null through, so an answer can be un-said", () => {
    const p = answersPayload({ chairs: null });
    expect(Object.prototype.hasOwnProperty.call(p, "chairs")).toBe(true);
    expect(p["chairs"]).toBeNull();
  });

  it("keeps false as false rather than dropping it", () => {
    // `answers[k] ?? null` must not turn a real "no" into "nobody asked".
    const p = answersPayload({ own_website: false });
    expect(p["own_website"]).toBe(false);
  });

  it("ignores anything that is not an answer key", () => {
    const p = answersPayload({ nonsense: true } as never);
    expect(Object.keys(p)).toEqual([]);
  });

  it("covers every key the migration understands", () => {
    expect(ANSWER_KEYS).toContain("missed_call_handling");
    expect(ANSWER_KEYS).toHaveLength(9);
  });
});

describe("the statements", () => {
  it("scopes the read to the tenant and the prospect", () => {
    const sql = CALL_SQL(
      "herman-legacy-digital",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(sql).toContain("'herman-legacy-digital'");
    expect(sql).toContain("'11111111-1111-1111-1111-111111111111'::uuid");
    expect(sql).toContain("p.tenant_id = (select id from t)");
  });

  it("writes as the tenant owner, and refuses if there is not one", () => {
    // The SQL endpoint connects as postgres, which bypasses RLS and every
    // permission check. Writing that way would let the console store what the
    // application itself would refuse.
    const sql = RECORD_CALL_SQL("hld", "22222222-2222-2222-2222-222222222222", {
      own_website: false,
    });
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain("refusing to write as a superuser");
    expect(sql).toContain("transform_audit.record_discovery");
    expect(sql).toContain("reset role");
  });

  it("escapes a quote in free text rather than breaking out of the statement", () => {
    const sql = RECORD_CALL_SQL("hld", "33333333-3333-3333-3333-333333333333", {
      notes: "O'Brien's shop -- said 'no' to booking",
    });
    // The payload is JSON-encoded and then single-quote-escaped; the result
    // must contain no unescaped quote that could end the literal early.
    const body = sql.slice(sql.indexOf("record_discovery"));
    const literal = body.slice(body.indexOf("'{"), body.indexOf("}'") + 2);
    expect(literal.match(/(?<!')'(?!')/g)).toHaveLength(2); // just the delimiters
  });
});
