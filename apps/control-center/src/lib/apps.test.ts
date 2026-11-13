import { describe, expect, it } from "vitest";
import {
  LOCAL_APPS,
  appUrl,
  classifyPort,
  portTakenMessage,
  stopListenerCommand,
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

describe("Game Cut in the console", () => {
  it("can be started from the home page, on its own port", () => {
    const gc = findApp("game-cut");
    expect(gc?.name).toBe("Game Cut");
    expect(gc?.filter).toBe("@hl-bos/game-cut-app");
    expect(gc?.port).toBe(4605);
    expect(gc?.healthPath).toBe("/api/health");
  });
});

describe("ATS Resume Optimizer in the console", () => {
  it("is started as a local app, so it does not mistake his laptop for a public deployment", () => {
    expect(findApp("ats-resume-optimizer")?.env).toEqual({ HL_BOS_ENV: "local" });
  });

  it("is the only app that needs it", () => {
    const others = LOCAL_APPS.filter((a) => a.key !== "ats-resume-optimizer");
    expect(others.every((a) => a.env === undefined)).toBe(true);
  });
});

describe("what is sitting on an app's port", () => {
  it("clears away only a stale refusing copy of our own app", () => {
    expect(classifyPort({ reached: false, ok: false, refusing: false })).toBe("free");
    expect(classifyPort({ reached: true, ok: true, refusing: false })).toBe("healthy");
    expect(classifyPort({ reached: true, ok: false, refusing: true })).toBe("stale-refusing");
  });

  it("does not call a refusing app healthy just because it answered 200", () => {
    // ok is computed as (HTTP ok && not refusing) before it reaches here.
    expect(classifyPort({ reached: true, ok: false, refusing: true })).not.toBe("healthy");
  });

  it("never stops something that is merely unhealthy and unidentified", () => {
    expect(classifyPort({ reached: true, ok: false, refusing: false })).toBe("someone-else");
  });

  it("says plainly when it will not touch the port", () => {
    const app = findApp("ats-resume-optimizer");
    expect(app).toBeDefined();
    if (app === undefined) return;
    expect(portTakenMessage(app)).toMatch(/Nothing was stopped/);
    expect(portTakenMessage(app)).not.toMatch(/pnpm|EADDRINUSE|pid/i);
  });

  it("builds the stop command for a real port and refuses anything else", () => {
    expect(stopListenerCommand(4600).join(" ")).toContain("-LocalPort 4600 -State Listen");
    expect(() => stopListenerCommand(0)).toThrow();
    expect(() => stopListenerCommand(4600.5)).toThrow();
    expect(() => stopListenerCommand(Number.NaN)).toThrow();
  });
});
