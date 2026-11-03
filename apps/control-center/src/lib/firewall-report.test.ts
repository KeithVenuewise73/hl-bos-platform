import { describe, expect, it } from "vitest";

import {
  describeAccess,
  parseProfile,
  parseRuleNames,
  probeFirewall,
  type FirewallFinding,
  type FirewallProbe,
} from "./firewall-report";

/** A probe that answers whatever the test says, and records what was asked. */
function probeOf(
  platform: string,
  answers: ReadonlyArray<{ ok: boolean; stdout: string }>,
): { probe: FirewallProbe; asked: string[][] } {
  const asked: string[][] = [];
  let turn = 0;
  return {
    asked,
    probe: {
      platform,
      run(bin, args) {
        asked.push([bin, ...args]);
        return Promise.resolve(answers[turn++] ?? { ok: false, stdout: "" });
      },
    },
  };
}

const OPEN: FirewallFinding = {
  rule: "found",
  profile: "Private",
  applicable: true,
  evidence: [],
};
const SHUT: FirewallFinding = {
  rule: "none",
  profile: "Private",
  applicable: true,
  evidence: [],
};
const UNKNOWN: FirewallFinding = {
  rule: "unknown",
  profile: "unknown",
  applicable: true,
  evidence: [],
};
/** Not Windows: nothing here to check, and no button that could help. */
const NO_FIREWALL: FirewallFinding = {
  rule: "unknown",
  profile: "unknown",
  applicable: false,
  evidence: [],
};

describe("parseRuleNames", () => {
  it("reads one rule per line", () => {
    expect(parseRuleNames("SceneFlow on your phone (TCP 4100)\r\nNode.js\r\n")).toEqual(
      ["SceneFlow on your phone (TCP 4100)", "Node.js"],
    );
  });

  it("treats blank output as no rules, not as a failure", () => {
    expect(parseRuleNames("")).toEqual([]);
    expect(parseRuleNames("\r\n  \n")).toEqual([]);
  });
});

describe("parseProfile", () => {
  it("reads the category Windows reports", () => {
    expect(parseProfile("Private\r\n")).toBe("Private");
    expect(parseProfile("Public\r\n")).toBe("Public");
  });

  it("prefers Private when the PC has several adapters", () => {
    // The question is whether the home Wi-Fi could match a Private rule, and
    // one adapter that can is enough to answer yes.
    expect(parseProfile("Public\r\nPrivate\r\n")).toBe("Private");
  });

  it("does not guess at output it does not recognise", () => {
    expect(parseProfile("")).toBe("unknown");
    expect(parseProfile("Get-NetConnectionProfile : not recognized")).toBe("unknown");
  });
});

describe("probeFirewall", () => {
  it("never claims to have read a Windows firewall off Windows", async () => {
    const { probe, asked } = probeOf("linux", []);
    const finding = await probeFirewall(probe);
    expect(finding.rule).toBe("unknown");
    expect(finding.applicable).toBe(false);
    // And it does not pretend by running anything, which on CI would fail.
    expect(asked).toEqual([]);
  });

  it("reports a rule when Windows names one", async () => {
    const { probe } = probeOf("win32", [
      { ok: true, stdout: "SceneFlow on your phone (TCP 4100)\r\n" },
      { ok: true, stdout: "Private\r\n" },
    ]);
    const finding = await probeFirewall(probe);
    expect(finding.rule).toBe("found");
    expect(finding.profile).toBe("Private");
  });

  it("asks about the port, so a rule the operator added himself still counts", async () => {
    const { probe, asked } = probeOf("win32", [
      { ok: true, stdout: "Node.js: Server-side JavaScript\r\n" },
      { ok: true, stdout: "Private\r\n" },
    ]);
    const finding = await probeFirewall(probe);
    expect(finding.rule).toBe("found");
    // The query must not be narrowed to this console's own rule name.
    const query = asked[0]?.join(" ") ?? "";
    expect(query).toContain("4100");
    expect(query).not.toContain("SceneFlow on your phone");
  });

  it("separates 'no rule' from 'could not ask'", async () => {
    const none = await probeFirewall(
      probeOf("win32", [
        { ok: true, stdout: "" },
        { ok: true, stdout: "Private\r\n" },
      ]).probe,
    );
    expect(none.rule).toBe("none");

    const broken = await probeFirewall(
      probeOf("win32", [
        { ok: false, stdout: "" },
        { ok: false, stdout: "" },
      ]).probe,
    );
    expect(broken.rule).toBe("unknown");
  });

  it("says what it ran, so the panel never asks to be taken on trust", async () => {
    const { probe } = probeOf("win32", [
      { ok: true, stdout: "" },
      { ok: true, stdout: "Public\r\n" },
    ]);
    const finding = await probeFirewall(probe);
    expect(finding.evidence.join("\n")).toContain("4100");
    expect(finding.evidence.join("\n")).toContain("Public");
  });
});

describe("describeAccess", () => {
  const up = {
    running: true,
    hasHomeAddress: true,
    listeningOnNetwork: true,
  } as const;

  it("is green only when nothing known is in the way", () => {
    const verdict = describeAccess({ ...up, firewall: OPEN });
    expect(verdict.clear).toBe(true);
    expect(verdict.offerRule).toBe(false);
    expect(verdict.message).toContain("Open the address below on your phone");
  });

  it("does not send a phone to an address the firewall blocks", () => {
    const verdict = describeAccess({ ...up, firewall: SHUT });
    expect(verdict.clear).toBe(false);
    expect(verdict.offerRule).toBe(true);
    // The exact failure Keith hit: the old panel said "open it on your phone"
    // in this state.
    expect(verdict.message).not.toContain("Open the address below on your phone");
    expect(verdict.message).toContain("firewall");
  });

  it("does not call a running app reachable when it only answered on loopback", () => {
    const verdict = describeAccess({
      ...up,
      listeningOnNetwork: false,
      firewall: OPEN,
    });
    expect(verdict.clear).toBe(false);
    expect(verdict.message).toContain("only on this PC");
  });

  it("refuses to call a Public network cleared, even with the rule in place", () => {
    // The rule exists and does not apply to this network. Green here would be
    // true of the rule and false of the machine.
    const verdict = describeAccess({
      ...up,
      firewall: { rule: "found", profile: "Public", applicable: true, evidence: [] },
    });
    expect(verdict.clear).toBe(false);
    expect(verdict.offerRule).toBe(false);
    expect(verdict.message).toContain("Public");
  });

  it("is neither green nor red when Windows could not be asked", () => {
    const verdict = describeAccess({ ...up, firewall: UNKNOWN });
    expect(verdict.clear).toBe(false);
    expect(verdict.message).toContain("untested");
  });

  it("says start it when it is not running, and offers no firewall rule", () => {
    const verdict = describeAccess({
      running: false,
      hasHomeAddress: true,
      listeningOnNetwork: false,
      firewall: SHUT,
    });
    expect(verdict.message).toBe("Not running. Start it below.");
    expect(verdict.offerRule).toBe(false);
  });

  it("blames the missing address, not the firewall, when there is no address", () => {
    const verdict = describeAccess({
      running: true,
      hasHomeAddress: false,
      listeningOnNetwork: false,
      firewall: SHUT,
    });
    expect(verdict.offerRule).toBe(false);
    expect(verdict.message).toContain("No home-network address");
  });

  it("offers no firewall button where there is no Windows firewall", () => {
    const verdict = describeAccess({ ...up, firewall: NO_FIREWALL });
    expect(verdict.offerRule).toBe(false);
    expect(verdict.message).toContain("not Windows");
  });

  it("never promises the phone will work, in any state", () => {
    // This machine cannot prove that: its own traffic to its own address does
    // not cross the firewall the way a phone's does. The ceiling is "nothing
    // known is in the way", and no wording may exceed it.
    for (const firewall of [OPEN, SHUT, UNKNOWN, NO_FIREWALL]) {
      const { message } = describeAccess({ ...up, firewall });
      expect(message).not.toMatch(/will work|guaranteed|confirmed working/i);
    }
  });
});
