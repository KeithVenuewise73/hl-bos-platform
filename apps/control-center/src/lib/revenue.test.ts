import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Revenue Center data source", () => {
  it("is not connected unless a local development database is named — it never guesses one", async () => {
    const { revenueSource } = await import("./revenue");
    const s = revenueSource({});
    expect(s.mode).toBe("not_connected");
    if (s.mode === "not_connected") expect(s.reason).toMatch(/needs your approval/);
  });

  it("refuses any database that is not on this computer", async () => {
    const { revenueSource } = await import("./revenue");
    const s = revenueSource({
      HLBOS_REVENUE_DEV_PG: "db.mvvtngiopdrgiedjmhfb.supabase.co:5432",
    });
    if (s.mode !== "development") throw new Error("expected development mode");
    await expect(s.rpc.rows(s.actor, "visibility.prospects", {})).rejects.toThrow(
      /non-local host/,
    );
  });
});
