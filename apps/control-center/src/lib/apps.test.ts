import { describe, expect, it } from "vitest";
import { LOCAL_APPS, appUrl, describeHealth, findApp } from "./apps-registry";

describe("local apps the console can start", () => {
  it("names every app in the CEO's language, not in package names", () => {
    for (const app of LOCAL_APPS) {
      expect(app.name).not.toContain("@hl-bos/");
      expect(app.what.length).toBeGreaterThan(30);
      expect(app.healthPath.startsWith("/")).toBe(true);
    }
  });

  it("gives every app its own port", () => {
    const ports = LOCAL_APPS.map((a) => a.port);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("builds a localhost URL, never a remote one", () => {
    for (const app of LOCAL_APPS) {
      expect(appUrl(app)).toBe(`http://localhost:${app.port}`);
    }
  });

  it("does not find an app that does not exist", () => {
    expect(findApp("not-a-real-app")).toBeUndefined();
  });

  it("will not call an unhealthy port 'running'", () => {
    const app = LOCAL_APPS[0];
    expect(app).toBeDefined();
    // The awkward third state: something answered, but not well. Offering a
    // link here would send him to an error page.
    const unhealthy = describeHealth(app!, { reached: true, ok: false });
    expect(unhealthy.running).toBe(false);
    expect(unhealthy.detail).toContain("not healthy");

    expect(describeHealth(app!, { reached: false, ok: false }).running).toBe(false);
    expect(describeHealth(app!, { reached: true, ok: true }).running).toBe(true);
  });
});
