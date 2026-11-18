import { describe, it, expect } from "vitest";
import { deliverInquiry, submissionIdFrom } from "./delivery";

const ID = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";
const URL_ = "https://inbox.example/hook";

type Call = { url: string; init: RequestInit };

function fakeFetch(answers: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) return Promise.reject(new Error("no more answers"));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("inquiry delivery", () => {
  it("delivers when the destination accepts it (2xx)", async () => {
    const f = fakeFetch([new Response("ok", { status: 200 })]);
    const r = await deliverInquiry(
      { a: 1 },
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r).toEqual({ delivered: true, attempts: 1 });
    expect(f.calls).toHaveLength(1);
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers["idempotency-key"]).toBe(ID);
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({ a: 1 });
  });

  it("does nothing and reports not_configured when no destination is set", async () => {
    const f = fakeFetch([]);
    for (const url of [undefined, "", "   "]) {
      const r = await deliverInquiry({}, { url, submissionId: ID, fetchImpl: f.impl });
      expect(r).toEqual({ delivered: false, reason: "not_configured", attempts: 0 });
    }
    expect(f.calls).toHaveLength(0);
  });

  it("does not retry a refusal (4xx) and reports it as rejected", async () => {
    const f = fakeFetch([new Response("bad", { status: 400 })]);
    const r = await deliverInquiry(
      {},
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r).toEqual({
      delivered: false,
      reason: "rejected",
      httpStatus: 400,
      attempts: 1,
    });
    expect(f.calls).toHaveLength(1);
  });

  it("retries a server error once, then reports failure", async () => {
    const f = fakeFetch([
      new Response("down", { status: 503 }),
      new Response("down", { status: 502 }),
    ]);
    const r = await deliverInquiry(
      {},
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r).toEqual({
      delivered: false,
      reason: "rejected",
      httpStatus: 502,
      attempts: 2,
    });
    expect(f.calls).toHaveLength(2);
  });

  it("retries a network failure with the SAME idempotency key and can succeed", async () => {
    const f = fakeFetch([new TypeError("fetch failed"), json(200, { ok: true })]);
    const r = await deliverInquiry(
      {},
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r).toEqual({ delivered: true, attempts: 2 });
    const keys = f.calls.map(
      (c) => (c.init.headers as Record<string, string>)["idempotency-key"],
    );
    expect(keys).toEqual([ID, ID]);
  });

  it("reports unreachable when every attempt fails or times out", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const f = fakeFetch([timeout, new TypeError("fetch failed")]);
    const r = await deliverInquiry(
      {},
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r).toEqual({ delivered: false, reason: "unreachable", attempts: 2 });
  });

  it("treats a 2xx that says {ok:false} as a refusal, not a delivery", async () => {
    const f = fakeFetch([json(200, { ok: false, error: "sheet locked" })]);
    const r = await deliverInquiry(
      {},
      { url: URL_, submissionId: ID, fetchImpl: f.impl },
    );
    expect(r.delivered).toBe(false);
    expect(r).toMatchObject({ reason: "rejected", httpStatus: 200 });
  });

  it("gives every attempt a timeout", async () => {
    const f = fakeFetch([new Response("ok", { status: 200 })]);
    await deliverInquiry({}, { url: URL_, submissionId: ID, fetchImpl: f.impl });
    expect(f.calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("submission id", () => {
  it("keeps a browser-supplied UUID so a retry is recognisably the same inquiry", () => {
    expect(submissionIdFrom(ID)).toBe(ID);
  });

  it("replaces anything that is not a UUID", () => {
    for (const bad of [undefined, "", "abc", "'; drop table x", 42]) {
      const id = submissionIdFrom(bad);
      expect(id).not.toBe(bad);
      expect(submissionIdFrom(id)).toBe(id);
    }
  });
});
