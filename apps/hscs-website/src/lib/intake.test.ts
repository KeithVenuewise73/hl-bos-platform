import { describe, it, expect } from "vitest";
import { readIntakeConfig, intakeStatus, submitToIntake, UNAVAILABLE } from "./intake";
import type { IntakePayload } from "./assessment-request";

const config = { url: "https://project.supabase.co", key: "sb_publishable_test" };

const payload: IntakePayload = {
  contact: {
    companyName: "Northbound",
    contactName: "Dana",
    email: "dana@northbound.test",
  },
  operation: {},
  priorities: {},
  context: {},
  consent: { privacy: true, contact: true },
};

/** A stand-in for the one bit of `Response` this module reads. */
const respond = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

const replies = (res: Response) => () => Promise.resolve(res);

describe("configuration", () => {
  it("is configured only when both values are present", () => {
    expect(
      readIntakeConfig({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "k".repeat(24),
      }),
    ).toEqual({ url: "https://x.supabase.co", key: "k".repeat(24) });
  });

  it("treats half-configured as unconfigured, so no dead form is ever rendered", () => {
    expect(readIntakeConfig({ SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    expect(readIntakeConfig({ SUPABASE_PUBLISHABLE_KEY: "k".repeat(24) })).toBeNull();
    expect(readIntakeConfig({})).toBeNull();
  });

  it("treats a blank value as unset rather than crashing the page", () => {
    expect(
      readIntakeConfig({
        SUPABASE_URL: "   ",
        SUPABASE_PUBLISHABLE_KEY: "k".repeat(24),
      }),
    ).toBeNull();
    expect(
      readIntakeConfig({
        SUPABASE_URL: "https://x.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toBeNull();
  });

  it("trims a trailing slash so the request URL is never doubled", () => {
    expect(
      readIntakeConfig({
        SUPABASE_URL: "https://x.supabase.co/",
        SUPABASE_PUBLISHABLE_KEY: "k".repeat(24),
      })?.url,
    ).toBe("https://x.supabase.co");
  });

  it("refuses a malformed URL loudly rather than posting requests into nowhere", () => {
    expect(() =>
      readIntakeConfig({
        SUPABASE_URL: "not-a-url",
        SUPABASE_PUBLISHABLE_KEY: "k".repeat(24),
      }),
    ).toThrow(/SUPABASE_URL is invalid/);
  });
});

describe("a successful submission", () => {
  it("reports success only with a real reference from the database", async () => {
    const out = await submitToIntake(
      payload,
      config,
      replies(respond(200, "HSCS-OA-1A2B3C4D")),
    );
    expect(out).toEqual({ ok: true, reference: "HSCS-OA-1A2B3C4D" });
  });

  it("calls the RPC with the payload as a named argument", async () => {
    let seenUrl = "";
    let seenBody = "";
    let seenHeaders: Record<string, string> = {};
    await submitToIntake(payload, config, (url, init) => {
      seenUrl = url;
      seenBody = typeof init.body === "string" ? init.body : "";
      seenHeaders = init.headers as Record<string, string>;
      return Promise.resolve(respond(200, "HSCS-OA-1A2B3C4D"));
    });
    expect(seenUrl).toBe(
      "https://project.supabase.co/rest/v1/rpc/submit_operations_assessment_request",
    );
    expect(JSON.parse(seenBody)).toEqual({ payload });
    expect(seenHeaders["apikey"]).toBe(config.key);
  });
});

describe("it never says received when it does not know that it was", () => {
  it.each([
    ["a success body that is not a reference", respond(200, { id: 1 })],
    ["an empty success body", respond(200, null)],
    ["a reference in the wrong case", respond(200, "HSCS-OA-lowercas")],
    ["a reference of the wrong length", respond(200, "HSCS-OA-1A2B")],
    ["a plausible-looking string from elsewhere", respond(200, "OK")],
  ])("refuses to claim success for %s", async (_label, res) => {
    const out = await submitToIntake(payload, config, replies(res));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("unavailable");
    expect(out.message).toBe(UNAVAILABLE);
  });

  it("refuses to claim success when the success body is not JSON at all", async () => {
    const broken = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
    const out = await submitToIntake(payload, config, replies(broken));
    expect(out.ok).toBe(false);
  });

  it("reports our fault, not theirs, when the network fails", async () => {
    const out = await submitToIntake(payload, config, () =>
      Promise.reject(new Error("ECONNREFUSED")),
    );
    expect(out).toEqual({ ok: false, reason: "unavailable", message: UNAVAILABLE });
  });

  it("reports unavailable when the RPC is missing — the migration is not applied", async () => {
    const out = await submitToIntake(
      payload,
      config,
      replies(
        respond(404, { code: "PGRST202", message: "Could not find the function" }),
      ),
    );
    expect(out).toEqual({ ok: false, reason: "unavailable", message: UNAVAILABLE });
  });
});

describe("refusals the person can act on", () => {
  it("passes the database's own message through for a check violation", async () => {
    const out = await submitToIntake(
      payload,
      config,
      replies(
        respond(400, {
          code: "23514",
          message: "privacy acknowledgment and contact consent are required",
        }),
      ),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("rejected");
    expect(out.message).toMatch(/consent/i);
  });

  it("recognises the duplicate-rapid guard and says so plainly", async () => {
    const out = await submitToIntake(
      payload,
      config,
      replies(
        respond(400, {
          code: "23514",
          message: "please wait a moment before submitting again",
        }),
      ),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("throttled");
    expect(out.message).toMatch(/minute/i);
  });

  it("does not treat an unrelated error code as something the visitor can fix", async () => {
    const out = await submitToIntake(
      payload,
      config,
      replies(respond(500, { code: "XX000", message: "internal error" })),
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe("unavailable");
  });
});

describe("intakeStatus — what the page branches on", () => {
  it("is connected when both values are set and valid", () => {
    const s = intakeStatus({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "k".repeat(24),
    });
    expect(s.connected).toBe(true);
  });

  it("is simply not connected when nothing is set — that is a valid deployment", () => {
    const s = intakeStatus({});
    expect(s).toEqual({ connected: false, misconfigured: false });
  });

  it("degrades to not-connected on a typo, rather than crashing at the visitor", () => {
    const logged: string[] = [];
    const s = intakeStatus(
      { SUPABASE_URL: "htps://typo", SUPABASE_PUBLISHABLE_KEY: "k".repeat(24) },
      (m) => logged.push(m),
    );
    expect(s).toEqual({ connected: false, misconfigured: true });
    // ...but it is loud where an operator will see it.
    expect(logged.join("")).toMatch(/MISCONFIGURED/);
  });
});
