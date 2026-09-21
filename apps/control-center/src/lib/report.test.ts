import { describe, expect, it } from "vitest";

import { formatReport, type ReportFacts } from "./report";

const facts: ReportFacts = {
  whenGenerated: "2026-09-21T01:00:00Z",
  version: {
    short: "f8a88ff",
    when: "5 minutes ago",
    branch: "main",
    behind: 0,
    hasGit: true,
    dirtyFiles: 0,
  },
  machine: {
    platform: "win32",
    release: "10.0.26100",
    node: "v22.20.0",
    bundledPnpm: true,
  },
  sceneflow: {
    running: true,
    homeUrls: ["http://192.168.1.50:4100"],
    awayUrls: ["http://100.75.144.111:4100"],
    codeSet: true,
  },
  gpu: { verdict: "no", headline: "No NVIDIA card." },
  lastLaunch: "SceneFlow is running.",
};

describe("formatReport", () => {
  it("NEVER contains the access code", () => {
    // This text is meant to be pasted into a chat window. A code pasted into a
    // chat window is a published code.
    const out = formatReport(facts);
    expect(out).toContain("access code:  set");
    expect(out).not.toMatch(/\b\d{6}\b/);
  });

  it("says a code is not set when there is none", () => {
    const out = formatReport({
      ...facts,
      sceneflow: { ...facts.sceneflow, codeSet: false },
    });
    expect(out).toContain("access code:  not set");
  });

  it("reports the version and how far behind", () => {
    const out = formatReport(facts);
    expect(out).toContain("f8a88ff");
    expect(out).toContain("behind main:  0");
  });

  it("distinguishes 'cannot check' from 'nothing waiting'", () => {
    const noGit = formatReport({
      ...facts,
      version: { ...facts.version, hasGit: false },
    });
    expect(noGit).toMatch(
      /behind main:\s+unknown \(this copy cannot collect updates\)/,
    );

    const unanswered = formatReport({
      ...facts,
      version: { ...facts.version, behind: -1 },
    });
    expect(unanswered).toMatch(/behind main:\s+unknown \(the check did not answer\)/);
  });

  it("names a missing build tool, which is what broke Start SceneFlow", () => {
    const out = formatReport({
      ...facts,
      machine: { ...facts.machine, bundledPnpm: false },
    });
    expect(out).toContain("MISSING from .hlbos/toolchain");
  });

  it("says plainly when no address was found rather than printing nothing", () => {
    const out = formatReport({
      ...facts,
      sceneflow: { ...facts.sceneflow, homeUrls: [], awayUrls: [] },
    });
    expect(out.match(/none found/g)).toHaveLength(2);
  });

  it("carries the last failure verbatim, indented, over several lines", () => {
    const out = formatReport({
      ...facts,
      lastLaunch: "It broke.\nsecond line",
    });
    expect(out).toContain("  It broke.\n  second line");
  });

  it("says so when the button has not been pressed", () => {
    expect(formatReport({ ...facts, lastLaunch: "" })).toContain("not pressed");
  });
});
