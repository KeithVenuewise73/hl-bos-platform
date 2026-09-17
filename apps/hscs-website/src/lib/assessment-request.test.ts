import { describe, it, expect } from "vitest";
import {
  OPERATION_TYPES,
  PRIMARY_CONCERNS,
  OPERATION_SCALES,
  LIMITS,
  validate,
  looksAutomated,
  fromFormData,
  type RawRequest,
} from "./assessment-request";

const good: RawRequest = {
  companyName: "Northbound Freight",
  contactName: "Dana Lee",
  email: "dana@northbound.test",
  consentPrivacy: true,
  consentContact: true,
};

const errorsOf = (raw: RawRequest) => {
  const r = validate(raw);
  return r.ok ? {} : r.errors;
};

describe("the minimum a request needs", () => {
  it("accepts a company, a person, an email and both consents — nothing more", () => {
    const r = validate(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.contact.companyName).toBe("Northbound Freight");
    expect(r.payload.consent).toEqual({ privacy: true, contact: true });
  });

  it("names every missing required field at once, not one at a time", () => {
    const e = errorsOf({});
    expect(Object.keys(e).sort()).toEqual(
      [
        "companyName",
        "consentContact",
        "consentPrivacy",
        "contactName",
        "email",
      ].sort(),
    );
  });

  it("treats whitespace as absence", () => {
    expect(errorsOf({ ...good, companyName: "   " }).companyName).toBeTruthy();
    expect(errorsOf({ ...good, contactName: "\t\n" }).contactName).toBeTruthy();
  });
});

describe("consent is never assumed", () => {
  it("refuses when either consent is absent — the key never arrives at all", () => {
    // An unticked checkbox is not sent by the browser, so the property is
    // missing rather than present-and-false. Both must be refused.
    const { consentPrivacy: _p, ...noPrivacy } = good;
    const { consentContact: _c, ...noContact } = good;
    expect(errorsOf(noPrivacy).consentPrivacy).toBeTruthy();
    expect(errorsOf(noContact).consentContact).toBeTruthy();
  });

  it("refuses when either consent is explicitly false", () => {
    expect(errorsOf({ ...good, consentPrivacy: false }).consentPrivacy).toBeTruthy();
    expect(errorsOf({ ...good, consentContact: false }).consentContact).toBeTruthy();
  });

  it("only ever emits consent as literal true — never a passed-through value", () => {
    const r = validate(good);
    if (!r.ok) throw new Error("expected valid");
    expect(r.payload.consent.privacy).toBe(true);
    expect(r.payload.consent.contact).toBe(true);
  });
});

describe("email, matching what the database will accept", () => {
  it.each(["dana@northbound.test", "d.lee+ops@sub.domain.co.uk", "x@y.io"])(
    "accepts %s",
    (email) => expect(validate({ ...good, email }).ok).toBe(true),
  );

  it.each([
    "dana",
    "dana@",
    "@northbound.test",
    "dana@northbound",
    "da na@x.io",
    "a@b.c d",
  ])("refuses %s", (email) => expect(errorsOf({ ...good, email }).email).toBeTruthy());

  it("lower-cases the address so the same person is one person", () => {
    const r = validate({ ...good, email: "  Dana@Northbound.TEST " });
    if (!r.ok) throw new Error("expected valid");
    expect(r.payload.contact.email).toBe("dana@northbound.test");
  });
});

describe("choices must come from the published list", () => {
  it("accepts every offered value", () => {
    for (const o of PRIMARY_CONCERNS)
      expect(validate({ ...good, primaryConcern: o.value }).ok).toBe(true);
    for (const o of OPERATION_SCALES)
      expect(validate({ ...good, operationScale: o.value }).ok).toBe(true);
  });

  it("refuses a value that was not offered (a tampered or stale form)", () => {
    expect(
      errorsOf({ ...good, primaryConcern: "everything" }).primaryConcern,
    ).toBeTruthy();
    expect(errorsOf({ ...good, operationScale: "99999" }).operationScale).toBeTruthy();
  });

  it("drops unknown operation types rather than storing something unreadable", () => {
    const r = validate({
      ...good,
      operationTypes: ["middle-mile-logistics", "not-a-real-type", "other"],
    });
    if (!r.ok) throw new Error("expected valid");
    expect(r.payload.operation.types).toEqual(["middle-mile-logistics", "other"]);
  });

  it("leaves optional sections absent rather than writing empty strings", () => {
    const r = validate(good);
    if (!r.ok) throw new Error("expected valid");
    expect(r.payload.operation).toEqual({});
    expect(r.payload.priorities).toEqual({});
    expect(r.payload.context).toEqual({});
    expect(r.payload.contact.phone).toBeUndefined();
  });
});

describe("length caps", () => {
  it("refuses anything past the cap the database also enforces", () => {
    expect(
      errorsOf({ ...good, companyName: "x".repeat(LIMITS.companyName + 1) })
        .companyName,
    ).toBeTruthy();
    expect(
      errorsOf({ ...good, whatPrompted: "x".repeat(LIMITS.whatPrompted + 1) })
        .whatPrompted,
    ).toBeTruthy();
  });

  it("accepts exactly the cap", () => {
    expect(validate({ ...good, companyName: "x".repeat(LIMITS.companyName) }).ok).toBe(
      true,
    );
  });
});

describe("the offered vocabularies", () => {
  it("has unique values and a label for every option", () => {
    for (const list of [OPERATION_TYPES, PRIMARY_CONCERNS, OPERATION_SCALES]) {
      const vals = list.map((o) => o.value);
      expect(new Set(vals).size).toBe(vals.length);
      for (const o of list) expect(o.label.trim()).toBeTruthy();
    }
  });

  it("lets an operator say they don't know yet — that's who the assessment is for", () => {
    expect(PRIMARY_CONCERNS.some((o) => o.value === "not-sure")).toBe(true);
  });

  it("lets an operator decline to state their size", () => {
    expect(OPERATION_SCALES.some((o) => o.value === "prefer-not-to-say")).toBe(true);
  });
});

describe("automated fillers", () => {
  it("spots a filled honeypot", () => {
    expect(looksAutomated({ honeypot: "http://spam.example" })).toBe(true);
  });
  it("ignores an empty or whitespace one, which is what a person leaves", () => {
    expect(looksAutomated({})).toBe(false);
    expect(looksAutomated({ honeypot: "   " })).toBe(false);
  });
});

describe("reading a submitted form", () => {
  const form = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it("reads an unticked checkbox as false, because the browser sends nothing", () => {
    const raw = fromFormData(form([["companyName", "Acme"]]));
    expect(raw.consentPrivacy).toBe(false);
    expect(raw.consentContact).toBe(false);
  });

  it("reads a ticked checkbox as true whatever value the browser sends", () => {
    const raw = fromFormData(
      form([
        ["consentPrivacy", "on"],
        ["consentContact", "yes"],
      ]),
    );
    expect(raw.consentPrivacy).toBe(true);
    expect(raw.consentContact).toBe(true);
  });

  it("collects every ticked operation type", () => {
    const raw = fromFormData(
      form([
        ["operationTypes", "middle-mile-logistics"],
        ["operationTypes", "warehousing-fulfillment"],
      ]),
    );
    expect(raw.operationTypes).toEqual([
      "middle-mile-logistics",
      "warehousing-fulfillment",
    ]);
  });

  it("round-trips a full form into a valid payload", () => {
    const raw = fromFormData(
      form([
        ["companyName", "Northbound Freight"],
        ["contactName", "Dana Lee"],
        ["email", "dana@northbound.test"],
        ["phone", "555-0100"],
        ["role", "VP Operations"],
        ["operationTypes", "middle-mile-logistics"],
        ["operationScale", "50-200"],
        ["primaryConcern", "transportation-fleet"],
        ["whatPrompted", "Cost per stop climbed 18%."],
        ["consentPrivacy", "on"],
        ["consentContact", "on"],
        ["sourcePage", "/request-an-assessment"],
      ]),
    );
    const r = validate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({
      contact: {
        companyName: "Northbound Freight",
        contactName: "Dana Lee",
        email: "dana@northbound.test",
        phone: "555-0100",
        role: "VP Operations",
      },
      operation: { types: ["middle-mile-logistics"], scale: "50-200" },
      priorities: { primaryConcern: "transportation-fleet" },
      context: { whatPrompted: "Cost per stop climbed 18%." },
      consent: { privacy: true, contact: true },
      sourcePage: "/request-an-assessment",
    });
  });
});
