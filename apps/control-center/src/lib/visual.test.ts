import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { MemoryRepository, type Prospect } from "@hl-bos/presence-scanner";
import type { VisualReview } from "@hl-bos/visual-review";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-06T12:00:00Z");
const lead = (over: Partial<Prospect> = {}): Prospect =>
  ({
    id: "lead-1",
    name: "Example Rinks",
    website: "rinks.example",
    corrections: {},
    findings: [],
    audit: [],
    ...over,
  }) as unknown as Prospect;

const review = (coverage: VisualReview["coverage"]): VisualReview => ({
  id: "vr-20261106-abc123",
  startUrl: "https://rinks.example",
  startedAt: NOW.toISOString(),
  finishedAt: NOW.toISOString(),
  coverage,
  coverageReason: `because ${coverage}`,
  pages: [],
  notVisited: [],
  environment: {
    browser: "chromium",
    userAgent: "x",
    desktopViewport: "1366x900",
    mobileViewport: "390x844",
    maxPages: 6,
  },
  version: "visual-review-0.1.0",
});

describe("visual review from the console", () => {
  it("reviews the lead's website (https added), saves the coverage on the lead, says what happened", async () => {
    const { visualReviewLead } = await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([lead()]);
    const run = vi.fn(() => Promise.resolve(review("blocked")));
    const r = await visualReviewLead("lead-1", { repo, run, outDir: "/x" });
    expect(run).toHaveBeenCalledWith("https://rinks.example", { outDir: "/x" });
    expect(r).toMatchObject({
      ok: false,
      headline: "The website could not be viewed: access was refused.",
    });
    expect((await repo.getProspect("lead-1"))?.visual?.coverage).toBe("blocked");
  });

  it("never opens a social page or a lead with no website", async () => {
    const { visualReviewLead } = await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([
      lead({ id: "a", website: "https://www.facebook.com/rinks" }),
      lead({ id: "b", website: undefined }),
    ]);
    const run = vi.fn(() => Promise.resolve(review("complete")));
    expect((await visualReviewLead("a", { repo, run, outDir: "/x" })).headline).toBe(
      "Not reviewed.",
    );
    expect((await visualReviewLead("b", { repo, run, outDir: "/x" })).headline).toBe(
      "No website to review.",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("serves only file names the review writes, from a valid review id", async () => {
    const { visualScreenshot, loadVisualReview } = await import("./visual");
    const dir = await mkdtemp(path.join(tmpdir(), "vr-console-"));
    await mkdir(path.join(dir, "vr-20261106-abc123"));
    await writeFile(path.join(dir, "vr-20261106-abc123", "p01-desktop.png"), "png");
    await writeFile(
      path.join(dir, "vr-20261106-abc123", "review.json"),
      JSON.stringify(review("complete")),
    );
    expect(
      (
        await visualScreenshot("vr-20261106-abc123", "p01-desktop.png", dir)
      )?.toString(),
    ).toBe("png");
    expect(
      await visualScreenshot("vr-20261106-abc123", "../review.json", dir),
    ).toBeUndefined();
    expect(await visualScreenshot("..", "p01-desktop.png", dir)).toBeUndefined();
    expect(
      await visualScreenshot("vr-20261106-abc123", "review.json", dir),
    ).toBeUndefined();
    expect((await loadVisualReview("vr-20261106-abc123", dir))?.coverage).toBe(
      "complete",
    );
    expect(await loadVisualReview("../etc", dir)).toBeUndefined();
  });
});
