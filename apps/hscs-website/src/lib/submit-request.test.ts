import { describe, it, expect } from "vitest";
import { handleRequest, NOT_CONFIGURED } from "./submit-request";
import type { RawRequest } from "./assessment-request";

const config = { url: "https://project.supabase.co", key: "k" };

const good: RawRequest = {
  companyName: "Northbound Freight",
  contactName: "Dana Lee",
  email: "dana@northbound.test",
  consentPrivacy: true,
  consentContact: true,
};

const accepts = () =>
  Promise.resolve({ ok: true as const, reference: "HSCS-OA-1A2B3C4D" });

describe("a good request", () => {
  it("is accepted and carries the database's reference back", async () => {
    const s = await handleRequest(good, { config, submit: accepts });
    expect(s).toEqual({ status: "ok", reference: "HSCS-OA-1A2B3C4D" });
  });

  it("sends exactly the validated payload, not the raw form", async () => {
    let seen: unknown;
    await handleRequest(
      { ...good, email: "  DANA@Northbound.TEST ", primaryConcern: "growth" },
      {
        config,
        submit: (p) => {
          seen = p;
          return Promise.resolve({ ok: true as const, reference: "HSCS-OA-1A2B3C4D" });
        },
      },
    );
    expect(seen).toMatchObject({
      contact: { email: "dana@northbound.test" },
      priorities: { primaryConcern: "growth" },
      consent: { privacy: true, contact: true },
    });
  });
});

describe("a refused request", () => {
  it("returns field errors and never reaches the database", async () => {
    let called = false;
    const s = await handleRequest(
      { ...good, email: "nope" },
      {
        config,
        submit: () => {
          called = true;
          return Promise.resolve({ ok: true as const, reference: "HSCS-OA-1A2B3C4D" });
        },
      },
    );
    expect(called).toBe(false);
    expect(s.status).toBe("error");
    if (s.status !== "error") return;
    expect(s.errors.email).toBeTruthy();
  });

  it("hands back everything the operator typed, so nothing is retyped", async () => {
    const typed = {
      ...good,
      email: "nope",
      whatPrompted: "Cost per stop climbed 18%.",
    };
    const s = await handleRequest(typed, { config, submit: accepts });
    if (s.status !== "error") throw new Error("expected error");
    expect(s.values.whatPrompted).toBe("Cost per stop climbed 18%.");
    expect(s.values.companyName).toBe("Northbound Freight");
  });

  it("passes a database refusal through as a form-level message", async () => {
    const s = await handleRequest(good, {
      config,
      submit: () =>
        Promise.resolve({
          ok: false as const,
          reason: "throttled" as const,
          message: "Give it a minute.",
        }),
    });
    if (s.status !== "error") throw new Error("expected error");
    expect(s.formError).toBe("Give it a minute.");
  });
});

describe("when the intake is not connected", () => {
  it("says so plainly instead of showing a thank-you", async () => {
    const s = await handleRequest(good, { config: null });
    if (s.status !== "error") throw new Error("expected error");
    expect(s.formError).toBe(NOT_CONFIGURED);
  });

  it("still reports the operator's own mistakes first", async () => {
    const s = await handleRequest({ ...good, email: "" }, { config: null });
    if (s.status !== "error") throw new Error("expected error");
    expect(s.errors.email).toBeTruthy();
    expect(s.formError).toBeUndefined();
  });
});

describe("automated fillers", () => {
  it("are refused, and are never silently thanked", async () => {
    let called = false;
    const s = await handleRequest(
      { ...good, honeypot: "http://spam.example" },
      {
        config,
        submit: () => {
          called = true;
          return Promise.resolve({ ok: true as const, reference: "HSCS-OA-1A2B3C4D" });
        },
      },
    );
    expect(called).toBe(false);
    expect(s.status).toBe("error");
    if (s.status !== "error") return;
    expect(s.formError).toMatch(/wasn't saved/i);
  });
});
