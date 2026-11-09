import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ getAll: () => [] }),
}));

const URL_OK = "https://mvvtngiopdrgiedjmhfb.supabase.co";
const jwt = (claims: object) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

describe("Pilot sign-in configuration", () => {
  it("is off unless both the address and the publishable key are set", async () => {
    const { pilotConfig } = await import("./revenue-pilot");
    expect(pilotConfig({})).toBeUndefined();
    expect(pilotConfig({ HLBOS_PILOT_SUPABASE_URL: URL_OK })).toBeUndefined();
    expect(
      pilotConfig({
        HLBOS_PILOT_SUPABASE_URL: `${URL_OK}/`,
        HLBOS_PILOT_PUBLISHABLE_KEY: "sb_publishable_abc",
      }),
    ).toEqual({ url: URL_OK, key: "sb_publishable_abc" });
  });

  it("refuses a server (service-role / secret) key — the pilot must run as the signed-in owner", async () => {
    const { pilotConfig } = await import("./revenue-pilot");
    expect(() =>
      pilotConfig({
        HLBOS_PILOT_SUPABASE_URL: URL_OK,
        HLBOS_PILOT_PUBLISHABLE_KEY: "sb_secret_abc",
      }),
    ).toThrow(/publishable key only/);
    expect(() =>
      pilotConfig({
        HLBOS_PILOT_SUPABASE_URL: URL_OK,
        HLBOS_PILOT_PUBLISHABLE_KEY: jwt({ role: "service_role" }),
      }),
    ).toThrow(/publishable key only/);
    expect(
      pilotConfig({
        HLBOS_PILOT_SUPABASE_URL: URL_OK,
        HLBOS_PILOT_PUBLISHABLE_KEY: jwt({ role: "anon" }),
      })?.key,
    ).toBeDefined();
  });

  it("refuses an address that is not a Supabase project", async () => {
    const { pilotConfig } = await import("./revenue-pilot");
    expect(() =>
      pilotConfig({
        HLBOS_PILOT_SUPABASE_URL: "https://evil.example.com",
        HLBOS_PILOT_PUBLISHABLE_KEY: "sb_publishable_abc",
      }),
    ).toThrow(/HL-BOS Supabase project/);
  });

  it("needs both an HLD and an HSCS line before it connects", async () => {
    const { tenantsFrom } = await import("./revenue-pilot");
    expect(tenantsFrom([{ tenant_id: "a", line: "hld" }])).toBeUndefined();
    expect(
      tenantsFrom([
        { tenant_id: "a", line: "hld" },
        { tenant_id: "b", line: "hscs" },
      ]),
    ).toEqual({ hld: "a", hscs: "b" });
  });
});

describe("Pilot safety checks", () => {
  const PILOT = {
    environment: "pilot" as const,
    allow_synthetic_records: false,
    allow_mock_delivery: false,
    allow_paid_discovery: false,
    allow_auto_notifications: false,
    allow_outbound_delivery: false,
  };
  const view = (over: object = {}, synthetic = 0, money: number | null = null) => ({
    release: { ...PILOT, ...over },
    totals: { prospects: 3, synthetic, byLine: { hld: 2, hscs: 1 } },
    dashboards: [
      {
        scope: "consolidated" as const,
        metrics: [
          {
            key: "mrr",
            label: "Monthly recurring revenue",
            value: money,
            unit: "cents" as const,
            status: money === null ? ("not_connected" as const) : ("measured" as const),
            note: "",
          },
        ],
        byChannel: [],
        demoRecordsExcluded: 0,
        recordsUsed: 0,
      },
    ],
  });

  it("the approved pilot posture passes every check", async () => {
    const { pilotChecks } = await import("./revenue-health");
    const c = pilotChecks("pilot", view());
    expect(c.map((x) => x.key)).toEqual([
      "env",
      "outbound",
      "auto",
      "paid",
      "mock",
      "synthetic",
      "money",
    ]);
    expect(c.every((x) => x.ok)).toBe(true);
  });

  it.each([
    ["outbound", { allow_outbound_delivery: true }],
    ["auto", { allow_auto_notifications: true }],
    ["paid", { allow_paid_discovery: true }],
    ["mock", { allow_mock_delivery: true }],
    ["synthetic", { allow_synthetic_records: true }],
    ["env", { environment: "development" }],
  ])("flags %s when the database allows it", async (key, over) => {
    const { pilotChecks } = await import("./revenue-health");
    expect(pilotChecks("pilot", view(over)).find((x) => x.key === key)?.ok).toBe(false);
  });

  it("flags synthetic records present in the pilot, and a money figure with no connected source", async () => {
    const { pilotChecks } = await import("./revenue-health");
    const c = pilotChecks("pilot", view({}, 2, 5000));
    expect(c.find((x) => x.key === "synthetic")?.detail).toMatch(/2 synthetic/);
    expect(c.find((x) => x.key === "money")?.ok).toBe(false);
  });

  it("unreadable settings are a failure, not a pass", async () => {
    const { pilotChecks } = await import("./revenue-health");
    const c = pilotChecks("pilot", { ...view(), release: undefined });
    expect(c).toHaveLength(1);
    expect(c[0]?.ok).toBe(false);
  });
});

describe("Revenue Center error log", () => {
  it("keeps the action, the message and the time — newest first, bounded length", async () => {
    const { RevenueErrorLog } = await import("./revenue-errors");
    const dir = await mkdtemp(path.join(tmpdir(), "rc-err-"));
    const log = new RevenueErrorLog(dir);
    await log.record(
      { action: "decide", message: "first", mode: "pilot" },
      new Date("2026-11-05T10:00:00Z"),
    );
    await log.record(
      { action: "send_to_review", message: "x".repeat(900), mode: "pilot" },
      new Date("2026-11-05T11:00:00Z"),
    );
    const r = await log.recent();
    expect(r.map((e) => e.action)).toEqual(["send_to_review", "decide"]);
    expect(r[0]?.message).toHaveLength(500);
    expect(await readFile(path.join(dir, "errors.jsonl"), "utf8")).not.toMatch(
      /password/,
    );
  });

  it("an empty log reads as no problems, not an error", async () => {
    const { RevenueErrorLog } = await import("./revenue-errors");
    expect(
      await new RevenueErrorLog(path.join(tmpdir(), "rc-none-xyz")).recent(),
    ).toEqual([]);
  });
});
