/**
 * The Lab GPU, in one sentence: is it on, can the Lab use it, what is it costing.
 *
 * The Private Lab (lab.aipersonax.com) renders on a rented RunPod card. Its
 * model, software and add-ons live on RunPod shared storage (a network
 * volume), so the server itself is disposable:
 *
 *   Turn on   create a server from the saved template, on any free 48 GB card
 *             in the storage's data centre, then point the Lab at it
 *   Turn off  delete the server; only the shared storage remains
 *
 * A server tied to one machine could not start when that machine's card was
 * rented elsewhere, three times in one day (2026-10-24). Creating a fresh one
 * each time takes any free card instead.
 *
 * The page must never say "off" while a card bills, or "ready" before the
 * model service answers AND the Lab is pointed at that server.
 *
 * Everything that decides anything is here, pure, so it is testable without a
 * RunPod or Coolify account. lab-gpu.ts does the network calls.
 */

/** The server's name. Found by name, since each Turn on makes a new one. */
export const LAB_POD_NAME = "aipx-lab-gpu";

/**
 * What Turn on creates. None of it is secret: the template (held privately at
 * RunPod) carries the server's own key, so the console never handles it.
 */
export const LAB_GPU_LAUNCH = {
  templateId: "xsqea4c8x8",
  networkVolumeId: "6sd8zu04kb",
  dataCenterId: "US-MO-1",
  /** 48 GB cards, cheapest first. RunPod takes the first one free. */
  gpuTypeIds: [
    "NVIDIA A40",
    "NVIDIA RTX A6000",
    "NVIDIA L40S",
    "NVIDIA L40",
    "NVIDIA RTX 6000 Ada Generation",
  ],
  /** The Lab's application in Coolify, whose GPU address Turn on updates. */
  coolifyApp: "hvhrxdanmpnv5vqd2riavn5t",
  coolifyBase: "https://coolify.aipersonax.com",
} as const;

/** The address the Lab must use to reach a given server. */
export function inferenceUrl(podId: string): string {
  return `https://${podId}-8000.proxy.runpod.net`;
}

/** The body RunPod needs to create the server. Pure, so it is tested. */
export function createPodBody(): Record<string, unknown> {
  return {
    name: LAB_POD_NAME,
    templateId: LAB_GPU_LAUNCH.templateId,
    networkVolumeId: LAB_GPU_LAUNCH.networkVolumeId,
    volumeMountPath: "/workspace",
    dataCenterIds: [LAB_GPU_LAUNCH.dataCenterId],
    gpuTypeIds: [...LAB_GPU_LAUNCH.gpuTypeIds],
    gpuTypePriority: "custom",
    gpuCount: 1,
    computeType: "GPU",
    cloudType: "SECURE",
    // The model is held in memory between steps; less than this and it fails.
    minRAMPerGPU: 64,
    containerDiskInGb: 30,
    ports: ["8000/http", "8001/http"],
  };
}

/** The subset of RunPod's Pod we read. Never the env: it holds the service token. */
export interface PodSummary {
  id: string;
  name: string;
  desiredStatus: string;
  costPerHr: number | null;
  gpu: string | null;
  volumeInGb: number | null;
  /** When RunPod last started it, in ms since 1970; null if it did not say. */
  startedAt: number | null;
}

export interface AccountSummary {
  balanceUsd: number | null;
  spendPerHrUsd: number | null;
}

export type LabGpuState =
  "not-connected" | "off" | "starting" | "stuck" | "not-pointed" | "ready" | "unknown";

/**
 * How long a server may take to answer before the page calls it stuck. On
 * 2026-10-24 two servers RunPod placed on one faulty machine never started at
 * all, and the page said "starting" while they billed. A healthy start from
 * the shared storage has not been timed yet; the first full setup, with every
 * download, took about 25 minutes, so this is set above anything a start that
 * only reads the storage should need.
 */
export const STUCK_AFTER_MINUTES = 20;

export interface LabGpuStatus {
  state: LabGpuState;
  /** One plain sentence for the headline. */
  headline: string;
  /** What it means for the Lab, and what to do. */
  meaning: string;
  podId: string | null;
  costPerHr: number | null;
  account: AccountSummary | null;
  canTurnOn: boolean;
  canTurnOff: boolean;
}

/** Pick only the fields we use. Anything else -- the env above all -- is dropped. */
export function toPodSummary(raw: unknown): PodSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["id"] !== "string" || typeof r["name"] !== "string") return null;
  const machine = (r["machine"] ?? {}) as Record<string, unknown>;
  const gpu = (r["gpu"] ?? {}) as Record<string, unknown>;
  const gpuName =
    (typeof machine["gpuTypeId"] === "string" && machine["gpuTypeId"]) ||
    (typeof gpu["displayName"] === "string" && gpu["displayName"]) ||
    null;
  return {
    id: r["id"],
    name: r["name"],
    desiredStatus: typeof r["desiredStatus"] === "string" ? r["desiredStatus"] : "",
    costPerHr: typeof r["costPerHr"] === "number" ? r["costPerHr"] : null,
    gpu: gpuName,
    volumeInGb: typeof r["volumeInGb"] === "number" ? r["volumeInGb"] : null,
    startedAt: parseRunpodTime(r["lastStartedAt"]),
  };
}

/** RunPod writes times as "2026-10-24 16:44:15.078 +0000 UTC". */
export function parseRunpodTime(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) \+0000/.exec(raw);
  const ms = m ? Date.parse(`${m[1]}T${m[2]}Z`) : Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** Every Lab server that still exists, running or stopped. */
export function labPods(pods: readonly PodSummary[]): PodSummary[] {
  return pods.filter(
    (p) => p.name === LAB_POD_NAME && p.desiredStatus !== "TERMINATED",
  );
}

/** The running Lab server, or null. The newest wins if, somehow, there are two. */
export function findLabPod(pods: readonly PodSummary[]): PodSummary | null {
  return (
    labPods(pods)
      .filter((p) => p.desiredStatus === "RUNNING")
      .at(-1) ?? null
  );
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Decide the status.
 *
 * `serviceReady`: the model service on the running server says it generates
 * images (null when there is no running server). `labPointsHere`: the Lab's
 * GPU address in Coolify is this server's (null when it could not be read).
 */
export function decideStatus(input: {
  connected: boolean;
  coolifyConnected: boolean;
  pods: readonly PodSummary[] | null;
  account: AccountSummary | null;
  serviceReady: boolean | null;
  labPointsHere: boolean | null;
  /** The time now, in ms; passed in so the decision stays pure. */
  now?: number;
  error?: string;
}): LabGpuStatus {
  const base = { podId: null, costPerHr: null, account: input.account };

  if (!input.connected) {
    return {
      ...base,
      state: "not-connected",
      headline: "The console is not connected to RunPod yet.",
      meaning:
        "Paste your RunPod key on the Connect page (the one named Claude in your password manager). Until then the console cannot see or switch the Lab GPU.",
      canTurnOn: false,
      canTurnOff: false,
    };
  }

  if (input.pods === null) {
    return {
      ...base,
      state: "unknown",
      headline:
        "RunPod did not answer, so the console cannot tell whether the GPU is on.",
      meaning:
        `Nothing was changed. Try again in a minute; if it keeps happening, check console.runpod.io/pods directly. ${input.error ?? ""}`.trim(),
      canTurnOn: false,
      canTurnOff: false,
    };
  }

  const pod = findLabPod(input.pods);
  const leftovers = labPods(input.pods).length > 0;

  if (!pod) {
    return {
      ...base,
      state: "off",
      headline: "The Lab GPU is off.",
      meaning: input.coolifyConnected
        ? `No card is billing; only the shared storage is (about $10 a month). Don't pick "Self-hosted GPU" in the Lab while it's off: that job would wait and fail. After Turn on, allow up to ${String(STUCK_AFTER_MINUTES)} minutes before it is ready.${leftovers ? " A stopped server from before is still there; Turn on removes it." : ""}`
        : "No card is billing. To turn it on from here, paste your Coolify key on the Connect page too: each Turn on makes a new server, and the console has to point the Lab at it. Until then, ask Claude to turn it on.",
      canTurnOn: input.coolifyConnected,
      canTurnOff: leftovers,
    };
  }

  const withPod = { ...base, podId: pod.id, costPerHr: pod.costPerHr };
  const rate = pod.costPerHr !== null ? `${usd(pod.costPerHr)} an hour` : "by the hour";

  const minutesOn =
    pod.startedAt !== null && input.now !== undefined
      ? Math.floor((input.now - pod.startedAt) / 60_000)
      : null;

  if (!input.serviceReady && minutesOn !== null && minutesOn >= STUCK_AFTER_MINUTES) {
    return {
      ...withPod,
      state: "stuck",
      headline: `The Lab GPU was switched on ${String(minutesOn)} minutes ago and has not started.`,
      meaning: `It is billing ${rate} anyway. This usually means RunPod put it on a machine that is not working. Turn it off; nothing is lost, the model stays on the shared storage. Try again later, and if it happens again, tell Claude.`,
      canTurnOn: false,
      canTurnOff: true,
    };
  }

  if (!input.serviceReady) {
    return {
      ...withPod,
      state: "starting",
      headline: "The Lab GPU is on and starting up.",
      meaning: `It is billing ${rate} already. ${minutesOn !== null ? `It was switched on ${String(minutesOn)} minute${minutesOn === 1 ? "" : "s"} ago. ` : ""}Refresh this page to check; if it is not ready within ${String(STUCK_AFTER_MINUTES)} minutes, this page will say so.`,
      canTurnOn: false,
      canTurnOff: true,
    };
  }

  if (input.labPointsHere === false) {
    return {
      ...withPod,
      state: "not-pointed",
      headline: "The Lab GPU is on, but the Lab is not pointed at it.",
      meaning: `It is billing ${rate}, and the Lab would send its jobs somewhere else. Turn it off and on again to repair this, or tell Claude.`,
      canTurnOn: false,
      canTurnOff: true,
    };
  }

  return {
    ...withPod,
    state: "ready",
    headline: "The Lab GPU is on and ready.",
    meaning: `"Self-hosted GPU — reference images" works in the Lab now${input.labPointsHere === null ? " (the console could not confirm the Lab's address)" : ""}. It is billing ${rate} whether or not you use it, so turn it off when you are done.`,
    canTurnOn: false,
    canTurnOff: true,
  };
}

/** RunPod's and Coolify's refusals, in plain English. Raw text goes in the detail. */
export function explainRunpodError(raw: string): string {
  if (
    /not enough free gpu|no (longer any )?instances|no gpus? (are )?available|insufficient.*gpu/i.test(
      raw,
    )
  ) {
    return "No 48 GB card is free in the Lab's data centre right now. Nothing is billing. Try again in a few minutes.";
  }
  if (/balance|insufficient funds|credit/i.test(raw)) {
    return "Your RunPod balance is too low to switch on. Add credit at console.runpod.io/user/billing, then try again.";
  }
  if (/401|403|unauthori[sz]ed|forbidden|invalid api key/i.test(raw)) {
    return "RunPod refused the console's key. It may have been deleted or replaced — paste a current one on the Connect page.";
  }
  return "RunPod refused the request. Nothing was changed. Tell Claude what the details say.";
}
