/**
 * The real routes, the real job manager and the real engine, with real ffmpeg on
 * two made-up game recordings (loud, moving moments at known times; camera B
 * started 7.3 s after A and is the one near the action at 115 s).
 * Skipped, and said so, when ffmpeg is not on the PATH.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const haveFfmpeg =
  spawnSync("ffmpeg", ["-version"]).status === 0 &&
  spawnSync("ffprobe", ["-version"]).status === 0;

const ff = (args: string[]) =>
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const GAME = 150;
const OFFSET = 7.3;
const BURSTS = [15, 60, 115];

interface PlanView {
  planId: string;
  mode: string;
  offsetSeconds: number | null;
  keptSeconds: number;
  names: { a: string; b: string | null };
  rows: { camera: string; label: string }[];
  problems: { line: number }[];
  skipped: { line: number }[];
}
interface JobView {
  state: string;
  step: string;
  fraction: number;
  error: string | null;
  result:
    | { kind: "plan"; plan: PlanView }
    | {
        kind: "make";
        made: { outFile: string; seconds: number; bytes: number; quality: string };
      }
    | null;
}
/** The plan a finished planning job produced. */
function planOf(job: JobView): PlanView {
  if (job.result?.kind !== "plan") throw new Error("that job made no plan");
  return job.result.plan;
}
function madeOf(job: JobView) {
  if (job.result?.kind !== "make") throw new Error("that job made no video");
  return job.result.made;
}

const local = { host: "127.0.0.1:4605", "Content-Type": "application/json" };
async function call(
  handler: (r: Request) => Response | Promise<Response>,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await handler(
    new Request(`http://127.0.0.1:4605${path}`, {
      method,
      headers: { ...local, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!haveFfmpeg)("Game Cut's API, end to end", () => {
  let dir = "";
  let fileA = "";
  let fileB = "";
  let status: typeof import("@/app/api/status/route");
  let plan: typeof import("@/app/api/jobs/plan/route");
  let make: typeof import("@/app/api/jobs/make/route");
  let current: typeof import("@/app/api/jobs/current/route");
  let cancel: typeof import("@/app/api/jobs/cancel/route");
  let reveal: typeof import("@/app/api/reveal/route");

  async function until(
    pred: (job: JobView) => boolean,
    ms = 150_000,
  ): Promise<JobView> {
    const end = Date.now() + ms;
    for (;;) {
      const { json } = await call(current.GET, "GET", "/api/jobs/current");
      const job = json["job"] as JobView | null;
      if (job && pred(job)) return job;
      if (Date.now() > end)
        throw new Error(`timed out; job is ${JSON.stringify(json["job"])}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const finished = (j: JobView) => j.state !== "running";

  beforeAll(async () => {
    status = await import("@/app/api/status/route");
    plan = await import("@/app/api/jobs/plan/route");
    make = await import("@/app/api/jobs/make/route");
    current = await import("@/app/api/jobs/current/route");
    cancel = await import("@/app/api/jobs/cancel/route");
    reveal = await import("@/app/api/reveal/route");
    dir = await mkdtemp(join(tmpdir(), "game-cut-app-"));
    const sound = join(dir, "sound.wav");
    const gate = BURSTS.map((b) => `between(t,${b},${b + 2})`).join("+");
    ff([
      "-f",
      "lavfi",
      "-i",
      `aevalsrc='(${gate})*0.7*sin(2*PI*600*t)+0.02*(random(0)*2-1)':s=48000:d=${GAME}`,
      sound,
    ]);
    const video = (w: number[][]) =>
      `color=c=0x303030:s=320x180:r=30:d=${GAME}[bg];color=c=white:s=40x40:r=30:d=${GAME}[box];` +
      `[bg][box]overlay=x='20+mod(t*60,200)':y=60:eval=frame:enable='${w.map(([s, e]) => `between(t,${s},${e})`).join("+")}'`;
    fileA = join(dir, "Game A.mp4");
    ff([
      "-f",
      "lavfi",
      "-i",
      video([
        [15, 17],
        [60, 62],
      ]),
      "-i",
      sound,
      "-t",
      String(GAME),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-metadata",
      "creation_time=2026-11-08T20:00:00Z",
      fileA,
    ]);
    fileB = join(dir, "Game B.mp4");
    ff([
      "-f",
      "lavfi",
      "-i",
      video([[115 - OFFSET, 117 - OFFSET]]),
      "-ss",
      String(OFFSET),
      "-i",
      sound,
      "-af",
      "volume=0.5",
      "-t",
      String(GAME - OFFSET),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-metadata",
      "creation_time=2026-11-08T20:00:07Z",
      fileB,
    ]);
  }, 180_000);

  afterAll(async () => {
    if (dir !== "") await rm(dir, { recursive: true, force: true });
  });

  it("only its own page may use it", async () => {
    const r = await call(
      plan.POST,
      "POST",
      "/api/jobs/plan",
      { mode: "broadcast", fileA, fileB },
      { origin: "http://evil.example" },
    );
    expect(r.status).toBe(403);
    const s = await call(status.GET, "GET", "/api/status", undefined, {
      origin: "http://evil.example",
    });
    expect(s.status).toBe(403);
  });

  it("says ffmpeg is found, and that there is no job and nothing to show yet", async () => {
    const s = await call(status.GET, "GET", "/api/status");
    expect(s.json["tools"]).toMatchObject({ found: true });
    expect(s.json["job"]).toBeNull();
    const r = await call(reveal.POST, "POST", "/api/reveal", {});
    expect(r.status).toBe(404);
  });

  it("refuses requests it cannot use, in words", async () => {
    expect(
      (await call(plan.POST, "POST", "/api/jobs/plan", { mode: "broadcast" })).json[
        "error"
      ],
    ).toMatch(/first video/);
    expect(
      (await call(plan.POST, "POST", "/api/jobs/plan", { mode: "broadcast", fileA }))
        .json["error"],
    ).toMatch(/second video/);
    expect(
      (
        await call(plan.POST, "POST", "/api/jobs/plan", {
          mode: "times",
          fileA,
          timesText: "   ",
        })
      ).json["error"],
    ).toMatch(/at least one time/);
    expect(
      (await call(plan.POST, "POST", "/api/jobs/plan", { mode: "nope", fileA })).status,
    ).toBe(400);
    expect(
      (
        await call(make.POST, "POST", "/api/jobs/make", {
          planId: "plan-999",
          outFile: join(dir, "x.mp4"),
        })
      ).status,
    ).toBe(404);
    expect((await call(make.POST, "POST", "/api/jobs/make", {})).json["error"]).toMatch(
      /where to save/,
    );
  });

  let broadcastPlanId = "";
  it("plans a broadcast in the background: A while the play is at its end, then B, with the alignment found", async () => {
    const started = await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "broadcast",
      fileA,
      fileB,
      quietCutSeconds: 90,
    });
    expect(started.status).toBe(200);
    // While it runs, a second job is refused.
    const second = await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "broadcast",
      fileA,
      fileB,
    });
    expect(second.status).toBe(409);
    const job = await until(finished);
    expect(job.state).toBe("done");
    expect(job.result?.kind).toBe("plan");
    const p = planOf(job);
    broadcastPlanId = p.planId;
    expect(p.mode).toBe("broadcast");
    expect(p.offsetSeconds).toBeGreaterThan(OFFSET - 0.2);
    expect(p.offsetSeconds).toBeLessThan(OFFSET + 0.2);
    const cams: string[] = p.rows.map((r) => r.camera);
    // A is near the first two moments and B near the third; nothing near A follows it.
    expect(cams.filter((c, i) => i === 0 || cams[i - 1] !== c)).toEqual(["A", "B"]);
    expect(p.names).toEqual({ a: "Game A.mp4", b: "Game B.mp4" });
    expect(p.keptSeconds).toBeGreaterThan(GAME * 0.9);
  }, 180_000);

  it("refuses to make it with a bad name or a bad place, before any work starts", async () => {
    const id = broadcastPlanId;
    expect(
      (
        await call(make.POST, "POST", "/api/jobs/make", {
          planId: id,
          outFile: join(dir, "notvideo.txt"),
        })
      ).json["error"],
    ).toMatch(/\.mp4/);
    expect(
      (await call(make.POST, "POST", "/api/jobs/make", { planId: id, outFile: fileA }))
        .json["error"],
    ).toMatch(/cannot replace/);
    expect(
      (
        await call(make.POST, "POST", "/api/jobs/make", {
          planId: id,
          outFile: join(dir, "nowhere", "x.mp4"),
        })
      ).json["error"],
    ).toMatch(/does not exist/);
  });

  it("makes the broadcast as a draft: one playable video, progress seen, no half-finished leftovers", async () => {
    const out = join(dir, "Broadcast.mp4");
    const started = await call(make.POST, "POST", "/api/jobs/make", {
      planId: broadcastPlanId,
      outFile: out,
      quality: "draft",
    });
    expect(started.status).toBe(200);
    const seen: number[] = [];
    const job = await until((j) => {
      seen.push(j.fraction);
      return finished(j);
    });
    expect(job.state).toBe("done");
    expect(madeOf(job)).toMatchObject({ outFile: out, quality: "draft" });
    expect(madeOf(job).bytes).toBeGreaterThan(1000);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(`${out}.partial`)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.startsWith(".game-cut-work"))).toEqual([]);
    const probe = execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      out,
    ]).toString();
    expect(probe).toMatch(/1280,720/);
    for (let i = 1; i < seen.length; i += 1)
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]! - 1e-9);
    // The originals are untouched.
    expect((await readFile(fileA)).length).toBeGreaterThan(1000);
  }, 240_000);

  // On Windows this would open a real Explorer window, so it is only run where it just answers.
  it.skipIf(process.platform === "win32")(
    "a finished video can be revealed (here it says where it is), and only that one",
    async () => {
      const r = await call(reveal.POST, "POST", "/api/reveal", {
        path: "C:\\Windows\\System32\\cmd.exe",
      });
      // Not Windows here: it names the file the job made, never the path in the request.
      expect(r.status).toBe(501);
      expect(r.json["error"]).toMatch(/Broadcast\.mp4/);
      expect(JSON.stringify(r.json)).not.toMatch(/System32/);
    },
  );

  it("highlights from times: reads the list, uses the camera that saw each moment, makes a video", async () => {
    const started = await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "times",
      fileA,
      fileB,
      timesText: "0:15 first\n1:00 second\n1:55 third\nnot a time\n99:00 late",
      beforeSeconds: 6,
      afterSeconds: 4,
    });
    expect(started.status).toBe(200);
    const job = await until(finished);
    expect(job.state).toBe("done");
    const p = planOf(job);
    expect(p.mode).toBe("times");
    expect(p.rows.map((r) => [r.label, r.camera])).toEqual([
      ["first", "A"],
      ["second", "A"],
      ["third", "B"],
    ]);
    expect(p.problems.map((x) => x.line)).toEqual([4]);
    expect(p.skipped.map((x) => x.line)).toEqual([5]);
    const out = join(dir, "Highlights.mp4");
    const m = await call(make.POST, "POST", "/api/jobs/make", {
      planId: p.planId,
      outFile: out,
      quality: "draft",
    });
    expect(m.status).toBe(200);
    const made = await until(finished);
    expect(made.state).toBe("done");
    expect(Math.abs(madeOf(made).seconds - 30)).toBeLessThan(0.5); // three clips of 10 s
    expect(existsSync(out)).toBe(true);
  }, 240_000);

  it("Stop ends a running make, and nothing is left: no video, no half-written file, no pieces", async () => {
    const planned = await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "times",
      fileA,
      fileB: null,
      timesText: "0:15\n0:40\n1:00\n1:30\n2:00",
    });
    expect(planned.status).toBe(200);
    const p = planOf(await until(finished));
    const out = join(dir, "Stopped.mp4");
    const m = await call(make.POST, "POST", "/api/jobs/make", {
      planId: p.planId,
      outFile: out,
      quality: "full",
    });
    expect(m.status).toBe(200);
    await until((j) => j.step !== "Starting…");
    expect(
      (await call(cancel.POST, "POST", "/api/jobs/cancel", {})).json["stopping"],
    ).toBe(true);
    const job = await until(finished);
    expect(job.state).toBe("cancelled");
    expect(job.result).toBeNull();
    expect(existsSync(out)).toBe(false);
    expect(existsSync(`${out}.partial`)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.startsWith(".game-cut-work"))).toEqual([]);
    // And with nothing running, Stop says so.
    expect(
      (await call(cancel.POST, "POST", "/api/jobs/cancel", {})).json["stopping"],
    ).toBe(false);
  }, 240_000);

  it("a file that is not a video fails in words, not with a crash", async () => {
    const junk = join(dir, "junk.mp4");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(junk, "this is not a video"),
    );
    await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "broadcast",
      fileA: junk,
      fileB,
    });
    const job = await until(finished);
    expect(job.state).toBe("failed");
    expect(typeof job.error).toBe("string");
    expect((job.error ?? "").length).toBeGreaterThan(5);
  }, 60_000);

  it("the same video twice, or a video that is not there, is refused in words", async () => {
    await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "broadcast",
      fileA,
      fileB: fileA,
    });
    expect((await until(finished)).error ?? "").toMatch(/same file/);
    await call(plan.POST, "POST", "/api/jobs/plan", {
      mode: "broadcast",
      fileA,
      fileB: join(dir, "missing.mp4"),
    });
    expect((await until(finished)).error ?? "").toMatch(/could not be found/);
  }, 60_000);
});
