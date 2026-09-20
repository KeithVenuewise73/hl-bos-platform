/**
 * The decisions behind "use SceneFlow from your phone", with nothing that
 * touches the machine, so every one of them is testable.
 *
 * The side-effecting half -- writing the code, building, starting the app --
 * is sceneflow-launch.ts. Same split as gpu.ts / gpu-report.ts.
 */

/** SceneFlow's port. One constant, so the console and the app cannot disagree. */
export const SCENEFLOW_PORT = 4100;

/**
 * A six-digit code.
 *
 * Six digits is a million possibilities, typed once on a phone keyboard. That
 * is weak against a patient attacker and strong against the actual threat: a
 * guest, a housemate or a smart television that happens to be on the same
 * Wi-Fi and finds a web server on port 4100.
 *
 * Generated with a cryptographic source rather than Math.random, and by
 * rejecting the tail of the range rather than taking a remainder, because a
 * remainder makes the low codes slightly more likely.
 */
export function codeFromBytes(next: () => number): string {
  const LIMIT = 1_000_000;
  // 2^24 = 16,777,216. The largest multiple of a million below it is 16,000,000.
  const CEILING = 16_000_000;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const value = next();
    if (value < CEILING) return String(value % LIMIT).padStart(6, "0");
  }
  // 64 consecutive draws in the top 4.6% of the range is not something a real
  // random source does; it means the source is broken. Refusing beats quietly
  // handing back a predictable code.
  throw new Error("The random source would not produce a code.");
}

export interface NetworkAddress {
  readonly address: string;
  readonly family: string;
  readonly internal: boolean;
}

/**
 * Which address a phone should be pointed at.
 *
 * Only IPv4, only addresses that are actually private ranges, and never the
 * loopback -- 127.0.0.1 typed into a phone reaches the phone.
 *
 * Link-local (169.254.x.x) is excluded too: Windows hands that out when DHCP
 * failed, so it means "this machine is not really on the network" and a URL
 * built from it would never load.
 */
export function phoneAddresses(
  interfaces: Readonly<Record<string, readonly NetworkAddress[] | undefined>>,
): string[] {
  const found: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.internal) continue;
      if (entry.family !== "IPv4" && entry.family !== "4") continue;
      if (!isPrivateIPv4(entry.address)) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found.sort(byHomeNetworkLikelihood);
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Home routers hand out 192.168.x.x far more often than anything else, and a
 * machine with several addresses is usually a machine with virtual adapters
 * (Docker, WSL, a VPN) that a phone cannot reach. Put the likely one first so
 * the first address shown is the one that works.
 */
function byHomeNetworkLikelihood(a: string, b: string): number {
  return rank(a) - rank(b) || a.localeCompare(b);
}

function rank(address: string): number {
  if (address.startsWith("192.168.")) return 0;
  if (address.startsWith("10.")) return 1;
  return 2;
}

export function phoneUrl(address: string, port = SCENEFLOW_PORT): string {
  return `http://${address}:${port}`;
}
