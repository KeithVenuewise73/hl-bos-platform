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

const noGuided = () => Promise.reject(new Error("not used"));

describe("visual review from the console", () => {
  it("reviews the lead's website (https added), saves the coverage on the lead, says what happened", async () => {
    const { visualReviewLead } = await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([lead()]);
    const run = vi.fn(() => Promise.resolve(review("blocked")));
    const r = await visualReviewLead("lead-1", {
      repo,
      run,
      guided: noGuided,
      outDir: "/x",
    });
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
    expect(
      (await visualReviewLead("a", { repo, run, guided: noGuided, outDir: "/x" }))
        .headline,
    ).toBe("Not reviewed.");
    expect(
      (await visualReviewLead("b", { repo, run, guided: noGuided, outDir: "/x" }))
        .headline,
    ).toBe("No website to review.");
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

describe("view it yourself, from the console", () => {
  it("opens a window for the lead's site, reports live progress, and saves the review on the lead when it closes", async () => {
    const { startGuidedReview, guidedStatus, stopGuidedReview } =
      await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([lead({ id: "g1" })]);
    let captured = 0;
    let close: (r: VisualReview) => void = () => undefined;
    const done = new Promise<VisualReview>((ok) => (close = ok));
    const guided = vi.fn(() =>
      Promise.resolve({
        id: "vr-20261106-guided1",
        captured: () => captured,
        page: {} as never, // a window is open
        done,
        stop: () => {
          close({ ...review("complete"), method: "guided" as const });
          return done;
        },
      }),
    );
    const deps = { repo, run: vi.fn(), guided, outDir: "/x" };
    const started = await startGuidedReview("g1", deps);
    expect(started.headline).toBe("A browser window has opened on your screen.");
    expect(started.meaning).toContain("don't fill in forms or make bookings");
    expect(guided).toHaveBeenCalledWith("https://rinks.example", { outDir: "/x" });
    // a second click does not open a second window
    expect((await startGuidedReview("g1", deps)).headline).toBe(
      "The browser window is already open.",
    );
    expect(guided).toHaveBeenCalledTimes(1);
    captured = 2;
    expect(guidedStatus("g1")).toMatchObject({ state: "running", pages: 2 });
    const r = await stopGuidedReview("g1");
    expect(r.headline).toBe("Saved: every page you opened was recorded.");
    expect(guidedStatus("g1").state).toBe("finished");
    expect((await repo.getProspect("g1"))?.visual?.coverage).toBe("complete");
  });

  it("never claims a window opened when none did; saves what happened on the lead", async () => {
    const { startGuidedReview, guidedStatus } = await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([lead({ id: "n1" })]);
    const failed = {
      ...review("failed"),
      method: "guided" as const,
      coverageReason: "The website's address could not be found.",
    };
    const guided = vi.fn(() =>
      Promise.resolve({
        id: failed.id,
        captured: () => 0,
        page: undefined,
        done: Promise.resolve(failed),
        stop: () => Promise.resolve(failed),
      }),
    );
    const r = await startGuidedReview("n1", {
      repo,
      run: vi.fn(),
      guided,
      outDir: "/x",
    });
    expect(r).toMatchObject({
      ok: false,
      headline: "No window was opened.",
      meaning: "The website's address could not be found.",
    });
    expect(guidedStatus("n1").state).toBe("idle");
    expect((await repo.getProspect("n1"))?.visual?.coverage).toBe("failed");
  });

  it("refuses the same leads the automatic review refuses, without opening anything", async () => {
    const { startGuidedReview } = await import("./visual");
    const repo = new MemoryRepository(() => NOW);
    await repo.saveProspects([
      lead({ id: "s1", website: "https://instagram.com/rinks" }),
    ]);
    const guided = vi.fn();
    expect(
      (await startGuidedReview("s1", { repo, run: vi.fn(), guided, outDir: "/x" }))
        .headline,
    ).toBe("Not reviewed.");
    expect(guided).not.toHaveBeenCalled();
  });
});
