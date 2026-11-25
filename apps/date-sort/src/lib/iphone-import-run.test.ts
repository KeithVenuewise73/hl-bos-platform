import { describe, expect, it } from "vitest";

import { importSteps, ALL_CHOICES } from "./iphone-import";
import { listDates, NO_PHONE, runStep, sortClipsByLength } from "./iphone-import-run";

const step = importSteps("D:\\P", "Ph", ALL_CHOICES)[0]!;

/** A fetch that answers with these lines, split into odd pieces like a real stream. */
function streamOf(lines: object[], ok = true): typeof fetch {
  const text = lines.map((l) => `${JSON.stringify(l)}\n`).join("");
  return ((_url: string) => {
    void _url;
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const mid = Math.floor(bytes.length / 2);
        c.enqueue(bytes.slice(0, mid));
        c.enqueue(bytes.slice(mid));
        c.close();
      },
    });
    return Promise.resolve(
      new Response(ok ? body : JSON.stringify({ error: "Not so fast." }), {
        status: ok ? 200 : 409,
      }),
    );
  }) as unknown as typeof fetch;
}

const found = {
  type: "found",
  device: "Apple iPhone",
  total: 5,
  bytes: 9000,
  todo: 3,
  todoBytes: 6000,
};

describe("one step of the import", () => {
  it("counts what came across, what was there and what failed", async () => {
    const seen: number[] = [];
    const out = await runStep(
      step,
      30,
      false,
      (p) => seen.push(p.done),
      streamOf([
        { type: "looking", folder: "202611_a", sofar: 0 },
        found,
        {
          type: "file",
          folder: "202611_a",
          name: "a.MOV",
          result: "copied",
          bytes: 2000,
        },
        { type: "file", folder: "202611_a", name: "b.MOV", result: "already" },
        { type: "file", folder: "202611_a", name: "c.MOV", result: "failed" },
        { type: "file", folder: "202611_a", name: "d.MOV", result: "short" },
        { type: "file", folder: "202611_a", name: "e.MOV", result: "conflict" },
        { type: "done" },
      ]),
    );
    expect(out.kind).toBe("ok");
    expect(out.result).toMatchObject({
      copied: 1,
      already: 1,
      conflicts: 1,
      bytes: 2000,
      todo: 3,
      todoBytes: 6000,
    });
    expect(out.result.failed).toEqual(["202611_a\\c.MOV"]);
    expect(out.result.short).toEqual(["202611_a\\d.MOV"]);
    expect(seen.at(-1)).toBe(5);
  });

  it("asks the copy for this step's kind, size, folder and days", async () => {
    let body: Record<string, unknown> = {};
    const f = ((_u: string, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Promise.resolve(new Response(`${JSON.stringify({ type: "done" })}\n`));
    }) as unknown as typeof fetch;
    await runStep(step, 12, true, () => undefined, f);
    expect(body).toEqual({
      folder: "D:\\P\\Ph\\Short Clips",
      kind: "videos",
      days: 12,
      size: "small",
      preview: true,
      allDates: true,
    });
  });

  it("sends the ticked days of a shared phone, never the 'every day' flag", async () => {
    let body: Record<string, unknown> = {};
    const f = ((_u: string, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Promise.resolve(new Response(`${JSON.stringify({ type: "done" })}\n`));
    }) as unknown as typeof fetch;
    await runStep(step, 30, false, () => undefined, f, ["2026-11-22", "2026-11-23"]);
    expect(body["dates"]).toEqual(["2026-11-22", "2026-11-23"]);
    expect(body["allDates"]).toBeUndefined();
  });

  it("counts a shared phone's days without copying, whether one day or several", async () => {
    const row = { d: "2026-11-23", p: 12, c: 3, g: 1, b: 5_000_000_000 };
    const many = await listDates(
      "D:\\P",
      30,
      streamOf([{ type: "dates", list: [row] }]),
    );
    expect(many).toEqual({ kind: "ok", rows: [row], olderFolders: 0 });
    // PowerShell writes a lone row as an object, not a list.
    const one = await listDates("D:\\P", 30, streamOf([{ type: "dates", list: row }]));
    expect(one).toEqual({ kind: "ok", rows: [row], olderFolders: 0 });
    let body: Record<string, unknown> = {};
    const f = ((_u: string, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Promise.resolve(new Response(`${JSON.stringify({ type: "none" })}\n`));
    }) as unknown as typeof fetch;
    const none = await listDates("D:\\P", 30, f);
    expect(none).toEqual({ kind: "problem", message: NO_PHONE });
    expect(body).toEqual({ list: true, folder: "D:\\P", days: 30 });
  });

  it("ends a size check at 'previewed'", async () => {
    const out = await runStep(
      step,
      30,
      true,
      () => undefined,
      streamOf([found, { type: "previewed" }]),
    );
    expect(out.kind).toBe("ok");
    expect(out.result.todo).toBe(3);
  });

  it("stops with a plain reason when there is no phone, or it is locked, or it errors", async () => {
    const none = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([{ type: "none" }]),
    );
    expect(none).toMatchObject({ kind: "problem", message: NO_PHONE });
    const locked = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([{ type: "locked", device: "Apple iPhone" }]),
    );
    expect(locked.kind === "problem" && locked.message).toMatch(
      /Unlock it and tap Trust/,
    );
    const err = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([{ type: "error", message: "Windows said no." }]),
    );
    expect(err).toMatchObject({ kind: "problem", message: "Windows said no." });
  });

  it("refuses to start a copy that will not fit, but not a size check", async () => {
    const space = { type: "space", needed: 50e9, free: 10e9, enough: false };
    const real = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([found, space, { type: "done" }]),
    );
    expect(real.kind === "problem" && real.message).toMatch(/Nothing was copied/);
    const check = await runStep(
      step,
      30,
      true,
      () => undefined,
      streamOf([found, space, { type: "previewed" }]),
    );
    expect(check.kind).toBe("ok");
  });

  it("reports a stream that ends early, and a refused request, in words", async () => {
    const early = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([found, { type: "file", folder: "a", name: "b", result: "copied" }]),
    );
    expect(early.kind === "problem" && early.message).toMatch(/stopped part-way/);
    expect(early.result.copied).toBe(1);
    const refused = await runStep(
      step,
      30,
      false,
      () => undefined,
      streamOf([], false),
    );
    expect(refused).toMatchObject({ kind: "problem", message: "Not so fast." });
  });

  it("ignores one garbled line instead of giving up", async () => {
    const text = `${JSON.stringify(found)}\nthis is not json\n${JSON.stringify({ type: "file", folder: "a", name: "b", result: "copied", bytes: 5 })}\n${JSON.stringify({ type: "done" })}\n`;
    const f = (() => Promise.resolve(new Response(text))) as unknown as typeof fetch;
    const out = await runStep(step, 30, false, () => undefined, f);
    expect(out.kind).toBe("ok");
    expect(out.result.copied).toBe(1);
  });

  it("says why when the connection fails", async () => {
    const f = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
    const out = await runStep(step, 30, false, () => undefined, f);
    expect(out.kind === "problem" && out.message).toMatch(
      /lost touch with this page \(TypeError: Failed to fetch\)/,
    );
  });
});

describe("sorting Short Clips by length", () => {
  it("asks only about the Short Clips folder and reports counts", async () => {
    let body: Record<string, unknown> = {};
    const f = ((_u: string, init?: RequestInit) => {
      body = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Promise.resolve(
        Response.json({
          kind: "sorted",
          looked: 9,
          long: [1, 2],
          moved: 2,
          conflicts: [],
          unreadable: [],
        }),
      );
    }) as unknown as typeof fetch;
    const out = await sortClipsByLength("D:\\P\\Ph\\Short Clips", true, f);
    expect(body).toEqual({ clipsFolder: "D:\\P\\Ph\\Short Clips", apply: true });
    expect(out).toEqual({
      kind: "ok",
      report: { looked: 9, long: 2, moved: 2, conflicts: 0, unreadable: 0 },
    });
  });
  it("says so in words when ffmpeg is missing", async () => {
    const f = (() =>
      Promise.resolve(
        Response.json({ kind: "needs-tool", message: "needs ffmpeg" }),
      )) as unknown as typeof fetch;
    expect(await sortClipsByLength("D:\\Short Clips", true, f)).toEqual({
      kind: "problem",
      message: "needs ffmpeg",
    });
  });
});
