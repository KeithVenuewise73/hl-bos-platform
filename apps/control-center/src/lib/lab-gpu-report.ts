/**
 * The Lab GPU, in one sentence: is it on, can the Lab use it, what is it costing.
 *
 * The Private Lab (lab.aipersonax.com) renders reference images on a rented
 * RunPod card. A running card bills by the hour whether or not anyone uses it,
 * so the one control that matters is On/Off -- and the one thing the page must
 * never do is say "off" while it is still billing, or "ready" before the model
 * service answers.
 *
 * Everything that decides anything is here, pure, so it is testable without a
 * RunPod account. lab-gpu.ts does the network calls.
 */

/** The pod's name, as created. Found by name so a re-created pod still works. */
export const LAB_POD_NAME = "aipx-lab-gpu";

/** The subset of RunPod's Pod we read. Never the env: it holds the service token. */
export interface PodSummary {
  id: string;
  name: string;
  desiredStatus: string;
  costPerHr: number | null;
  gpu: string | null;
  volumeInGb: number | null;
}

export interface AccountSummary {
  balanceUsd: number | null;
  spendPerHrUsd: number | null;
}

export type LabGpuState =
  "not-connected" | "missing" | "off" | "starting" | "ready" | "unknown";

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
  };
}

/** The Lab's pod, or null. The newest wins if, somehow, there are two. */
export function findLabPod(pods: readonly PodSummary[]): PodSummary | null {
  const mine = pods.filter(
    (p) => p.name === LAB_POD_NAME && p.desiredStatus !== "TERMINATED",
  );
  return mine.at(-1) ?? null;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Decide the status. `serviceReady` is whether the model service on the pod
 * answered its health route saying it generates images; null when not asked
 * (the pod is not running).
 */
export function decideStatus(input: {
  connected: boolean;
  pods: readonly PodSummary[] | null;
  account: AccountSummary | null;
  serviceReady: boolean | null;
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
  if (!pod) {
    return {
      ...base,
      state: "missing",
      headline: "There is no Lab GPU on your RunPod account.",
      meaning:
        "It has been deleted (terminated), so there is nothing to switch on. Nothing is billing for it. Ask Claude to set a new one up — it takes about 15 minutes, most of it downloading the model.",
      canTurnOn: false,
      canTurnOff: false,
    };
  }

  const withPod = { ...base, podId: pod.id, costPerHr: pod.costPerHr };
  const rate = pod.costPerHr !== null ? `${usd(pod.costPerHr)} an hour` : "by the hour";

  if (pod.desiredStatus === "EXITED") {
    return {
      ...withPod,
      state: "off",
      headline: "The Lab GPU is off.",
      meaning: `The card is not billing. Its storage still is, a little — the model stays saved so switching on takes minutes, not a fresh download. Don't pick "Self-hosted GPU" in the Lab while it's off: that job would wait and fail. Switching on costs ${rate}.`,
      canTurnOn: true,
      canTurnOff: false,
    };
  }

  if (pod.desiredStatus === "RUNNING" && input.serviceReady) {
    return {
      ...withPod,
      state: "ready",
      headline: "The Lab GPU is on and ready.",
      meaning: `"Self-hosted GPU — reference images" works in the Lab now. It is billing ${rate} whether or not you use it, so turn it off when you are done. The first image after switching on takes about 2 minutes longer while the model loads.`,
      canTurnOn: false,
      canTurnOff: true,
    };
  }

  if (pod.desiredStatus === "RUNNING") {
    return {
      ...withPod,
      state: "starting",
      headline: "The Lab GPU is on and starting up.",
      meaning: `It is billing ${rate} already. It is usually ready about 2 minutes after switching on; refresh this page to check. If it still says starting after 15 minutes, tell Claude.`,
      canTurnOn: false,
      canTurnOff: true,
    };
  }

  return {
    ...withPod,
    state: "unknown",
    headline: `RunPod reports the Lab GPU as "${pod.desiredStatus || "unknown"}".`,
    meaning:
      "That is not a state the console knows. Nothing was changed. Tell Claude what it says.",
    canTurnOn: false,
    canTurnOff: true,
  };
}

/** RunPod's refusals, in plain English. Raw text goes in the detail. */
export function explainRunpodError(raw: string): string {
  if (
    /not enough free gpu|no (longer any )?instances|no gpus? (are )?available|insufficient.*gpu/i.test(
      raw,
    )
  ) {
    return "RunPod has no free card on the machine this GPU lives on right now — someone else is renting it. Try again later, or ask Claude to move the Lab GPU to another machine (the model downloads again, about 5 minutes).";
  }
  if (/balance|insufficient funds|credit/i.test(raw)) {
    return "Your RunPod balance is too low to switch on. Add credit at console.runpod.io/user/billing, then try again.";
  }
  if (/401|403|unauthori[sz]ed|forbidden|invalid api key/i.test(raw)) {
    return "RunPod refused the console's key. It may have been deleted or replaced — paste a current one on the Connect page.";
  }
  return "RunPod refused the request. Nothing was changed. Tell Claude what the details say.";
}
