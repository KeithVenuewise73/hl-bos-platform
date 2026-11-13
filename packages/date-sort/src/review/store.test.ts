import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cleanServiceUrl, ensureKey, loadReview, saveReview } from "./store";

const dir = () => mkdtempSync(join(tmpdir(), "review-store-"));

describe("what is remembered about the website", () => {
  it("starts empty", async () => {
    expect(await loadReview(dir())).toEqual({
      serviceUrl: null,
      key: null,
      connectedAt: null,
    });
  });

  it("makes a key once and keeps it", async () => {
    const d = dir();
    const a = await ensureKey(d);
    const b = await ensureKey(d);
    expect(a.key).toBeTruthy();
    expect(a.key!.length).toBeGreaterThanOrEqual(40);
    expect(b.key).toBe(a.key);
  });

  it("keeps the key file private to this user (where the system allows)", async () => {
    const d = dir();
    await ensureKey(d);
    if (process.platform !== "win32")
      expect(statSync(join(d, "review.json")).mode & 0o077).toBe(0);
  });

  it("round-trips what was saved, and ignores a damaged file", async () => {
    const d = dir();
    await saveReview(
      {
        serviceUrl: "https://x.example/review",
        key: "k".repeat(43),
        connectedAt: "2026-11-13T12:00:00Z",
      },
      d,
    );
    expect(await loadReview(d)).toMatchObject({
      serviceUrl: "https://x.example/review",
      connectedAt: "2026-11-13T12:00:00Z",
    });
    writeFileSync(join(d, "review.json"), "{ not json");
    expect(await loadReview(d)).toEqual({
      serviceUrl: null,
      key: null,
      connectedAt: null,
    });
    expect(readFileSync(join(d, "review.json"), "utf8")).toContain("not json");
  });

  it("accepts only an https address (or this computer for testing)", () => {
    expect(cleanServiceUrl("https://abc.supabase.co/functions/v1/media-review/")).toBe(
      "https://abc.supabase.co/functions/v1/media-review",
    );
    expect(cleanServiceUrl("http://127.0.0.1:9999")).toBe("http://127.0.0.1:9999");
    expect(cleanServiceUrl("http://evil.example")).toBeNull();
    expect(cleanServiceUrl("javascript:alert(1)")).toBeNull();
    expect(cleanServiceUrl("")).toBeNull();
    expect(cleanServiceUrl(42)).toBeNull();
  });
});
