import { describe, expect, it } from "vitest";

import { isSameOrigin } from "./http.ts";

const req = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:4602/api/x", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts the app's own origin", () => {
    expect(
      isSameOrigin(req({ origin: "http://127.0.0.1:4602", host: "127.0.0.1:4602" })),
    ).toBe(true);
  });
  it("refuses another site", () => {
    expect(
      isSameOrigin(req({ origin: "https://evil.example", host: "127.0.0.1:4602" })),
    ).toBe(false);
  });
  it("refuses a request with no origin", () => {
    expect(isSameOrigin(req({ host: "127.0.0.1:4602" }))).toBe(false);
  });
});

describe("seeOther", () => {
  it("redirects with a relative Location, never a guessed host", async () => {
    const { seeOther } = await import("./http.ts");
    const r = seeOther("/projects/x/media");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/projects/x/media");
  });
});
