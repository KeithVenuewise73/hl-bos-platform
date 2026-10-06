import { describe, expect, it } from "vitest";
import {
  LOCAL_APPS,
  appUrl,
  describeHealth,
  findApp,
  nodeAtLeast,
  nodeTooOld,
} from "./apps-registry";

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

describe("an app that needs a newer Node than the console", () => {
  it("compares versions numerically, not as text", () => {
    expect(nodeAtLeast("v22.13.0", "22.13.0")).toBe(true);
    expect(nodeAtLeast("v22.22.0", "22.13.0")).toBe(true);
    expect(nodeAtLeast("v24.1.0", "22.13.0")).toBe(true);
    expect(nodeAtLeast("v22.12.9", "22.13.0")).toBe(false);
    expect(nodeAtLeast("v22.9.0", "22.13.0")).toBe(false);
    expect(nodeAtLeast("v20.18.0", "22.13.0")).toBe(false);
  });

  it("refuses JerseySort on Node 22.12 and says what to install", () => {
    const js = findApp("jersey-sort");
    expect(js?.minNode).toBe("22.13.0");
    const why = js === undefined ? null : nodeTooOld(js, "v22.12.0");
    expect(why).toContain("needs Node 22.13.0 or newer");
    expect(why).toContain("this computer has Node 22.12.0");
    expect(why).toContain("nodejs.org");
    expect(js === undefined ? "x" : nodeTooOld(js, "v22.13.0")).toBeNull();
  });

  it("does not hold back an app with no minimum", () => {
    for (const app of LOCAL_APPS.filter((a) => a.minNode === undefined)) {
      expect(nodeTooOld(app, "v22.0.0")).toBeNull();
    }
  });
});

describe("DateSort in the console", () => {
  it("can be started from the home page, on the port DateSort.bat uses", () => {
    const ds = findApp("date-sort");
    expect(ds?.name).toBe("DateSort");
    expect(ds?.filter).toBe("@hl-bos/date-sort-app");
    expect(ds?.port).toBe(4604);
    expect(ds?.healthPath).toBe("/api/health");
  });
});
