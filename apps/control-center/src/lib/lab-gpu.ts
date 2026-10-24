import "server-only";

import {
  decideStatus,
  explainRunpodError,
  findLabPod,
  toPodSummary,
  type AccountSummary,
  type LabGpuStatus,
  type PodSummary,
} from "@/lib/lab-gpu-report";
import { readEnvFile } from "@/lib/secrets";

/**
 * The network half of the Lab GPU switch. Decisions live in lab-gpu-report.ts.
 *
 * The key is the CEO's RunPod key, saved on the Connect page into the
 * gitignored .env.local. It is sent only to RunPod, in a header, and never
 * returned to the browser. RunPod's pod records include the pod's environment
 * -- the inference service's token among it -- so every pod passes through
 * toPodSummary, which keeps only the fields the page uses.
 */

const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";

async function key(): Promise<string | null> {
  const env = await readEnvFile();
  return env["RUNPOD_API_KEY"] || null;
}

async function runpod(
  apiKey: string,
  path: string,
  method: "GET" | "POST" = "GET",
): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const res = await fetch(REST + path, {
    method,
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Some RunPod errors are plain text. `text` carries it.
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function listPods(apiKey: string): Promise<PodSummary[]> {
  const r = await runpod(apiKey, "/pods");
  if (!r.ok || !Array.isArray(r.body)) {
    throw new Error(
      `RunPod /pods answered ${String(r.status)}: ${r.text.slice(0, 200)}`,
    );
  }
  return r.body.map(toPodSummary).filter((p): p is PodSummary => p !== null);
}

/** Balance and what the whole account is being charged right now. Best effort. */
async function account(apiKey: string): Promise<AccountSummary | null> {
  try {
    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ myself { clientBalance currentSpendPerHr } }" }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: { myself?: { clientBalance?: unknown; currentSpendPerHr?: unknown } };
    };
    const me = json.data?.myself;
    if (!me) return null;
    return {
      balanceUsd: typeof me.clientBalance === "number" ? me.clientBalance : null,
      spendPerHrUsd:
        typeof me.currentSpendPerHr === "number" ? me.currentSpendPerHr : null,
    };
  } catch {
    return null;
  }
}

/** Whether the model service on the pod says it can generate. No token needed. */
async function serviceReady(podId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${podId}-8000.proxy.runpod.net/health`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { generates_images?: unknown };
    return json.generates_images === true;
  } catch {
    return false;
  }
}

export async function labGpuStatus(): Promise<LabGpuStatus> {
  const apiKey = await key();
  if (!apiKey) {
    return decideStatus({
      connected: false,
      pods: [],
      account: null,
      serviceReady: null,
    });
  }
  let pods: PodSummary[];
  try {
    pods = await listPods(apiKey);
  } catch (error) {
    return decideStatus({
      connected: true,
      pods: null,
      account: null,
      serviceReady: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const pod = findLabPod(pods);
  const [acct, ready] = await Promise.all([
    account(apiKey),
    pod?.desiredStatus === "RUNNING" ? serviceReady(pod.id) : Promise.resolve(null),
  ]);
  return decideStatus({ connected: true, pods, account: acct, serviceReady: ready });
}

export interface SwitchResult {
  ok: boolean;
  message: string;
  detail?: string;
}

/** Turn the Lab GPU on or off. Acts only on the pod named in LAB_POD_NAME. */
export async function switchLabGpu(to: "on" | "off"): Promise<SwitchResult> {
  const apiKey = await key();
  if (!apiKey) {
    return {
      ok: false,
      message:
        "The console is not connected to RunPod. Paste your RunPod key on the Connect page.",
    };
  }
  let pod: PodSummary | null;
  try {
    pod = findLabPod(await listPods(apiKey));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: explainRunpodError(detail), detail };
  }
  if (!pod) {
    return {
      ok: false,
      message:
        "There is no Lab GPU on your RunPod account to switch. Ask Claude to set one up.",
    };
  }

  const r = await runpod(
    apiKey,
    `/pods/${pod.id}/${to === "on" ? "start" : "stop"}`,
    "POST",
  );
  if (!r.ok) {
    return {
      ok: false,
      message: explainRunpodError(r.text),
      detail: r.text.slice(0, 500),
    };
  }
  return to === "on"
    ? {
        ok: true,
        message:
          "Switched on. It is billing from now. It is usually ready in about 2 minutes — refresh this page to see when.",
      }
    : {
        ok: true,
        message:
          'Switched off. The card has stopped billing; only its storage still costs a little. Don\'t pick "Self-hosted GPU" in the Lab until you switch it back on.',
      };
}
