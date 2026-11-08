import { describe, it, expect } from "vitest";
import {
  handleIntake,
  NOT_DELIVERED_MESSAGE,
  type InquiryEnvelope,
} from "./intake-handler";
import type { DeliveryResult } from "./delivery";

const ID = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";
const valid = {
  submissionId: ID,
  kind: "consultation" as const,
  businessName: "Acme Roofing",
  website: "https://acme.example",
  industry: "Contractor",
  contactName: "Dana Lee",
  email: "dana@acme.example",
  phone: "716-000-0000",
  goals: "More calls from Google",
  challenges: "Old website",
  consent: true,
  source: { path: "/book", utm_source: "flyer" },
};
const PERSONAL = [
  "Acme Roofing",
  "Dana Lee",
  "dana@acme.example",
  "716-000-0000",
  "More calls",
  "Old website",
];

function harness(result: DeliveryResult) {
  const sent: InquiryEnvelope[] = [];
  const logs: string[] = [];
  return {
    sent,
    logs,
    deliver: (e: InquiryEnvelope) => {
      sent.push(e);
      return Promise.resolve(result);
    },
    log: (m: string, f: Record<string, unknown>) => logs.push(m + JSON.stringify(f)),
  };
}
const fixedNow = () => new Date("2026-10-27T12:00:00Z");

describe("Contact / Book intake front door", () => {
  it("answers 'received' only after the destination accepted the inquiry", async () => {
    const h = harness({ delivered: true, attempts: 1 });
    const r = await handleIntake(valid, h.deliver, h.log, fixedNow);
    expect(r.httpStatus).toBe(200);
    expect(r.json).toMatchObject({ status: "received" });
    expect(r.json.status === "received" && r.json.ref).toMatch(/^HLD-/);
    expect(h.sent).toHaveLength(1);
    const e = h.sent[0]!;
    expect(e).toMatchObject({
      schema: "hld.inquiry.v1",
      submissionId: ID,
      submittedAt: "2026-10-27T12:00:00.000Z",
      kind: "consultation",
      contact: { name: "Dana Lee", email: "dana@acme.example", phone: "716-000-0000" },
      attribution: { path: "/book", utm_source: "flyer" },
    });
  });

  it("missing configuration: tells the visitor it was NOT received (503)", async () => {
    const h = harness({ delivered: false, reason: "not_configured", attempts: 0 });
    const r = await handleIntake(valid, h.deliver, h.log, fixedNow);
    expect(r.httpStatus).toBe(503);
    expect(r.json).toEqual({ status: "not_delivered", message: NOT_DELIVERED_MESSAGE });
    expect(JSON.stringify(r.json)).not.toMatch(/received"|captured/);
  });

  it("delivery failure: tells the visitor it was NOT received (503)", async () => {
    const h = harness({
      delivered: false,
      reason: "rejected",
      httpStatus: 500,
      attempts: 2,
    });
    const r = await handleIntake(valid, h.deliver, h.log, fixedNow);
    expect(r.httpStatus).toBe(503);
    expect(r.json.status).toBe("not_delivered");
    expect(h.logs.join()).toContain('"reason":"rejected"');
  });

  it("writes no personal details to the server log, on success or failure", async () => {
    for (const result of [
      { delivered: true, attempts: 1 } as const,
      { delivered: false, reason: "not_configured", attempts: 0 } as const,
      { delivered: false, reason: "unreachable", attempts: 2 } as const,
    ]) {
      const h = harness(result);
      await handleIntake(valid, h.deliver, h.log, fixedNow);
      const logged = h.logs.join("\n");
      expect(logged).toContain(ID);
      for (const p of PERSONAL) expect(logged).not.toContain(p);
    }
  });

  it("rejects an invalid submission without sending anything", async () => {
    const h = harness({ delivered: true, attempts: 1 });
    const r = await handleIntake(
      { ...valid, email: "not-an-email", consent: false },
      h.deliver,
      h.log,
    );
    expect(r.httpStatus).toBe(422);
    expect(r.json.status).toBe("invalid");
    expect(h.sent).toHaveLength(0);
  });

  it("gives a submission without a valid id a fresh one", async () => {
    const h = harness({ delivered: true, attempts: 1 });
    await handleIntake({ ...valid, submissionId: "x" }, h.deliver, h.log);
    expect(h.sent[0]!.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.sent[0]!.submissionId).not.toBe("x");
  });
});
