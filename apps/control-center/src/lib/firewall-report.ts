/**
 * Whether a phone can actually reach SceneFlow, and what to say when it cannot.
 *
 * Nothing here touches the machine, so every decision is testable without a
 * Windows box. The side-effecting half -- running PowerShell, asking Windows
 * for the firewall rule, creating one -- is firewall.ts. Same split as
 * gpu-report.ts / gpu.ts.
 *
 * Why this file exists at all: SceneFlow binds 0.0.0.0 and the panel used to
 * say "open the address on your phone" as soon as the app answered on
 * localhost and the PC had a home-network address. Neither of those facts says
 * anything about whether a packet from a phone survives the Windows firewall,
 * and on a default Windows install it does not. So the panel sent the operator
 * to an address that could not load, which is exactly the failure the rest of
 * this console is built to avoid.
 */

/** SceneFlow's port, as the firewall rule names it. Imported from one place. */
import { SCENEFLOW_PORT } from "./sceneflow-access";

/** The rule this console creates. Matched by name so pressing twice is safe. */
export const RULE_NAME = `SceneFlow on your phone (TCP ${SCENEFLOW_PORT})`;

/**
 * Does Windows hold an inbound rule naming this port?
 *
 * Three answers, not two. "unknown" is its own case because a machine that
 * cannot be asked -- PowerShell missing, the cmdlet absent on an old build,
 * this console running on Linux in CI -- must not be reported as blocked. An
 * invented "blocked" would send the operator to press a button he does not
 * need.
 */
export type RuleState = "found" | "none" | "unknown";

/**
 * Which profile Windows has given the network this PC is on.
 *
 * It matters because the rule this console adds is scoped to Private. A home
 * Wi-Fi marked Public -- which Windows does whenever "make this PC
 * discoverable" was answered No -- will not match that rule, and the operator
 * would press the button, see it succeed, and still find nothing on his phone.
 */
export type NetworkProfile = "Private" | "Public" | "Domain" | "unknown";

export interface FirewallFinding {
  readonly rule: RuleState;
  readonly profile: NetworkProfile;
  /**
   * There is a Windows firewall here to allow or block anything.
   *
   * False off Windows, where the rule this console adds does not exist as a
   * concept. Separated from `rule: "unknown"` because the two want opposite
   * things from the panel: an unknown on Windows is worth offering the button
   * for, and an unknown on Linux is a button that could not possibly help.
   */
  readonly applicable: boolean;
  /** Exactly what was run and what came back. Shown, never summarised away. */
  readonly evidence: readonly string[];
}

/**
 * Rule names that cover TCP 4100 inbound, one per line, from the query below.
 *
 * Blank output means no rule, which is a real answer and not a failure -- the
 * caller separates that from "could not ask" by whether the command succeeded.
 */
export function parseRuleNames(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The profile of the live connection.
 *
 * A PC with several adapters reports several. Private wins when any adapter
 * has it, because the question being answered is "could the home Wi-Fi match a
 * Private rule", and one adapter that can is enough.
 */
export function parseProfile(stdout: string): NetworkProfile {
  const words = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (words.some((w) => /^private$/i.test(w))) return "Private";
  if (words.some((w) => /^domain(authenticated)?$/i.test(w))) return "Domain";
  if (words.some((w) => /^public$/i.test(w))) return "Public";
  return "unknown";
}

export interface FirewallProbe {
  readonly platform: string;
  run(bin: string, args: readonly string[]): Promise<{ ok: boolean; stdout: string }>;
}

/**
 * Every rule naming this exact port, inbound, enabled, allowing.
 *
 * Deliberately asked by port and not by rule name: Windows itself offers to
 * allow node.exe the first time SceneFlow starts, and an operator who clicked
 * Allow on that popup is already through. Looking only for this console's own
 * rule would report him blocked and push a button he does not need.
 *
 * The reverse gap is real and is not papered over: a program rule for node.exe
 * carries no port filter, so it will not appear here. That is why "none" is
 * worded as "no rule names this port" rather than "you are blocked", and why
 * the panel leans on the rule it can see rather than claiming a verdict it
 * cannot reach from this machine alone.
 */
const RULE_QUERY = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  `Get-NetFirewallPortFilter -Protocol TCP | Where-Object { $_.LocalPort -eq '${SCENEFLOW_PORT}' } | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' } | Select-Object -ExpandProperty DisplayName`,
] as const;

const PROFILE_QUERY = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "Get-NetConnectionProfile | Select-Object -ExpandProperty NetworkCategory",
] as const;

export async function probeFirewall(probe: FirewallProbe): Promise<FirewallFinding> {
  const evidence: string[] = [];

  if (probe.platform !== "win32") {
    // There is no Windows firewall to ask about. Saying "found" would be a
    // lie and "none" would be a different one.
    evidence.push(`Not Windows (${probe.platform}) — no Windows firewall to read`);
    return { rule: "unknown", profile: "unknown", applicable: false, evidence };
  }

  const rules = await probe.run("powershell", [...RULE_QUERY]);
  evidence.push(
    `Inbound TCP ${SCENEFLOW_PORT} firewall rules: ${rules.ok ? "read" : "could not be read"}`,
  );
  const names = rules.ok ? parseRuleNames(rules.stdout) : [];
  if (rules.ok && names.length > 0) {
    evidence.push(`Found: ${names.join(", ")}`);
  }

  const profiles = await probe.run("powershell", [...PROFILE_QUERY]);
  evidence.push(`Network profile: ${profiles.ok ? "read" : "could not be read"}`);
  const profile = profiles.ok ? parseProfile(profiles.stdout) : "unknown";
  if (profile !== "unknown") evidence.push(`This PC is on a ${profile} network`);

  return {
    rule: !rules.ok ? "unknown" : names.length > 0 ? "found" : "none",
    profile,
    applicable: true,
    evidence,
  };
}

export interface AccessInput {
  /** SceneFlow answered on 127.0.0.1. */
  readonly running: boolean;
  /** This PC has an address a phone on the same Wi-Fi could type. */
  readonly hasHomeAddress: boolean;
  /**
   * SceneFlow answered on that home address, not just on loopback -- so it is
   * bound to the network rather than to this machine. Proven by asking it.
   */
  readonly listeningOnNetwork: boolean;
  readonly firewall: FirewallFinding;
}

export interface AccessVerdict {
  /** Green dot only when nothing known is in the way. */
  readonly clear: boolean;
  /** True when adding the firewall rule is the thing that would help. */
  readonly offerRule: boolean;
  readonly message: string;
}

/**
 * The sentence under the dot.
 *
 * Ordered by what the operator should do next, and it never promises the phone
 * will work -- this machine cannot prove that on its own, because traffic from
 * this PC to its own address does not cross the firewall the way a phone's
 * does. The honest ceiling is "nothing known is blocking it", and that is what
 * the cleared message says.
 */
export function describeAccess(input: AccessInput): AccessVerdict {
  const { running, hasHomeAddress, listeningOnNetwork, firewall } = input;

  if (!running) {
    return { clear: false, offerRule: false, message: "Not running. Start it below." };
  }

  if (!hasHomeAddress) {
    return {
      clear: false,
      offerRule: false,
      message:
        "Running on this PC. No home-network address was found, so a phone cannot reach it — the PC is probably on a VPN, or not on Wi-Fi.",
    };
  }

  if (!listeningOnNetwork) {
    return {
      clear: false,
      offerRule: false,
      message:
        "Running, but it answered only on this PC and not on the home-network address, so a phone cannot reach it. Press Start again to restart it on the network.",
    };
  }

  if (firewall.rule === "none") {
    return {
      clear: false,
      offerRule: true,
      message: `Running and listening on your home network, but Windows holds no firewall rule for port ${SCENEFLOW_PORT}, so it is very likely blocking your phone. Use the button below.`,
    };
  }

  if (firewall.rule === "found" && firewall.profile === "Public") {
    return {
      clear: false,
      offerRule: false,
      // The rule exists and does not apply. Saying "allowed" here would be
      // true of the rule and false of the machine.
      message:
        "A firewall rule exists, but Windows has this Wi-Fi marked Public, and the rule only covers Private networks. Set this network to Private in Windows settings, or your phone will stay blocked.",
    };
  }

  if (!firewall.applicable) {
    // No Windows firewall exists to be the obstacle, and no button here could
    // change whatever is. Offering one would be a control that does nothing.
    return {
      clear: false,
      offerRule: false,
      message:
        "Running and listening on the network. This is not Windows, so there is no firewall rule for this console to check or add — try the address on your phone.",
    };
  }

  if (firewall.rule === "unknown") {
    return {
      clear: false,
      offerRule: true,
      // Not green: we did not establish it. Not red: we did not disprove it.
      message:
        "Running and listening on your home network. Windows could not be asked about the firewall, so whether your phone gets through is untested — try the address, and use the button below if it does not load.",
    };
  }

  return {
    clear: true,
    offerRule: false,
    message:
      "Running, listening on your home network, and the firewall allows it. Open the address below on your phone and type the code.",
  };
}
