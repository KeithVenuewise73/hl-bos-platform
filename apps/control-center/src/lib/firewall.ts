import "server-only";

import {
  probeFirewall,
  RULE_NAME,
  type FirewallFinding,
  type FirewallProbe,
} from "@/lib/firewall-report";
import { SCENEFLOW_PORT } from "@/lib/sceneflow-access";
import { cmd } from "@/lib/shell";

/**
 * Reading the Windows firewall, and adding the one rule that lets a phone in.
 *
 * Everything that decides anything lives in firewall-report.ts, where it is
 * testable without a Windows machine. This file is the part that actually runs
 * PowerShell.
 */

const REAL: FirewallProbe = {
  platform: process.platform,
  async run(bin, args) {
    const result = await cmd(bin, args, { timeoutMs: 15_000 });
    return { ok: result.ok, stdout: result.stdout };
  },
};

export async function readFirewall(): Promise<FirewallFinding> {
  return probeFirewall(REAL);
}

export interface RuleResult {
  readonly ok: boolean;
  /** Plain English, always. Never a stack trace. */
  readonly message: string;
  readonly detail?: string;
}

/**
 * The elevated half.
 *
 * Creating a firewall rule needs Administrator, which this console does not
 * have and should not have: it runs builds and git all day, and running that
 * as Administrator to make one network change would be the wrong trade. So it
 * asks Windows to elevate a single command instead, and the operator sees the
 * standard UAC prompt. Declining it is a normal outcome, not an error.
 *
 * Scoped to Private on purpose. `-Profile Any` would also cover coffee-shop
 * Wi-Fi, where the six-digit code would be the only thing between SceneFlow
 * and the other people on that network. Private keeps the opening to networks
 * Windows already treats as the operator's own; if his home Wi-Fi is marked
 * Public, the panel says so rather than widening the rule to compensate.
 *
 * Remove-then-create makes pressing it twice harmless: without the remove,
 * New-NetFirewallRule happily stacks duplicates under the same display name.
 */
const ELEVATED_COMMAND = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  [
    "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden",
    "-ArgumentList '-NoProfile','-NonInteractive','-Command',",
    `'Remove-NetFirewallRule -DisplayName ''${RULE_NAME}'' -ErrorAction SilentlyContinue;`,
    `New-NetFirewallRule -DisplayName ''${RULE_NAME}'' -Direction Inbound -Action Allow`,
    `-Protocol TCP -LocalPort ${SCENEFLOW_PORT} -Profile Private | Out-Null'`,
  ].join(" "),
] as const;

/**
 * Add the rule, then prove it is there.
 *
 * The verification is the point. Start-Process -Wait returns when the elevated
 * window closes, which it also does when the operator clicks No, and when the
 * cmdlet inside fails on a machine where the firewall service is off. Reporting
 * success on "the command returned" would put a green tick on a machine that
 * still blocks every phone -- so this re-reads the rule from Windows and
 * believes that instead.
 */
export async function allowPhonesThroughFirewall(): Promise<RuleResult> {
  if (process.platform !== "win32") {
    return {
      ok: false,
      message:
        "This only applies to Windows, and this console is not running on Windows, so nothing was changed.",
    };
  }

  const before = await readFirewall();
  if (before.rule === "found") {
    return {
      ok: true,
      message: `A firewall rule for port ${SCENEFLOW_PORT} is already in place. Nothing was changed.`,
    };
  }

  const run = await cmd("powershell", [...ELEVATED_COMMAND], { timeoutMs: 120_000 });

  const after = await readFirewall();
  if (after.rule === "found") {
    const warning =
      after.profile === "Public"
        ? " Windows has this Wi-Fi marked Public, though, and the rule covers Private networks only — so your phone will still be blocked until that is changed in Windows settings."
        : "";
    return {
      ok: true,
      message: `Windows now allows phones on your home network to reach SceneFlow on port ${SCENEFLOW_PORT}.${warning}`,
      detail: after.evidence.join("\n"),
    };
  }

  // Everything below here is a failure, and each one is reported as itself.
  if (/canceled by the user|cancelled by the user/i.test(run.output)) {
    return {
      ok: false,
      message:
        "The Windows permission prompt was declined, so no rule was added and phones are still blocked.",
      detail: run.output.slice(-1200),
    };
  }

  return {
    ok: false,
    message: `The rule was not added, so phones are still blocked. Windows was asked to create it and afterwards no rule for port ${SCENEFLOW_PORT} could be found.`,
    detail: [run.output.slice(-1200), ...after.evidence].join("\n").trim(),
  };
}
