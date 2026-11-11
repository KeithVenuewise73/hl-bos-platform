import { describe, expect, it } from "vitest";

import { guard, refuseUnlessLocal } from "./guard";

describe("only Game Cut's own page may use its API", () => {
  it("allows its own page", () => {
    for (const host of ["localhost:4605", "127.0.0.1:4605", "[::1]:4605"]) {
      expect(refuseUnlessLocal({ host, origin: `http://${host}` })).toBeNull();
      expect(refuseUnlessLocal({ host, origin: null })).toBeNull(); // same-origin GETs, tools
    }
  });

  it("refuses another website, even one pointed at 127.0.0.1", () => {
    expect(
      refuseUnlessLocal({ host: "localhost:4605", origin: "http://evil.example" }),
    ).not.toBeNull();
    expect(
      refuseUnlessLocal({ host: "localhost:4605", origin: "http://localhost:4000" }),
    ).not.toBeNull();
    expect(
      refuseUnlessLocal({ host: "localhost:4605", origin: "null" }),
    ).not.toBeNull();
    expect(
      refuseUnlessLocal({ host: "localhost:4605", origin: "not a url" }),
    ).not.toBeNull();
    // DNS rebinding: an attacker's name resolving to 127.0.0.1.
    expect(
      refuseUnlessLocal({
        host: "evil.example:4605",
        origin: "http://evil.example:4605",
      }),
    ).not.toBeNull();
    expect(refuseUnlessLocal({ host: null, origin: null })).not.toBeNull();
  });

  it("accepts only JSON posts", () => {
    const post = (type: string) =>
      new Request("http://localhost:4605/api/scan", {
        method: "POST",
        headers: { host: "localhost:4605", "content-type": type },
        body: "{}",
      });
    expect(guard(post("application/json"))).toBeNull();
    expect(guard(post("text/plain"))?.status).toBe(415);
    expect(guard(post("application/x-www-form-urlencoded"))?.status).toBe(415);
  });
});
