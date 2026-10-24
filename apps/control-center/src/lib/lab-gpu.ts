import "server-only";

import {
  createPodBody,
  decideStatus,
  explainRunpodError,
  findLabPod,
  inferenceUrl,
  labPods,
  LAB_GPU_LAUNCH,
  toPodSummary,
  STUCK_AFTER_MINUTES,
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
 *
 * Turn on also needs the CEO's Coolify key (COOLIFY_API_TOKEN, same file): a
 * new server has a new address, and the Lab must be pointed at it. Coolify's
 * settings list carries every Lab secret, so exactly one setting is read from
 * it and the rest are dropped where they arrive.
 */

const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const LAB_URL_KEY = "SELF_HOSTED_INFERENCE_URL";

async function keys(): Promise<{ runpod: string | null; coolify: string | null }> {
  const env = await readEnvFile();
  return {
    runpod: env["RUNPOD_API_KEY"] || null,
    coolify: env["COOLIFY_API_TOKEN"] || null,
  };
}

interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
  text: string;
}

async function call(
  url: string,
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  json?: unknown,
): Promise<Reply> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Some refusals are plain text. `text` carries it.
  }
  return { ok: res.ok, status: res.status, body, text };
}

async function listPods(apiKey: string): Promise<PodSummary[]> {
  const r = await call(`${REST}/pods`, apiKey);
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
    const r = await call(GRAPHQL, apiKey, "POST", {
      query: "{ myself { clientBalance currentSpendPerHr } }",
    });
    const me = (r.body as { data?: { myself?: Record<string, unknown> } } | null)?.data
      ?.myself;
    if (!me) return null;
    return {
      balanceUsd: typeof me["clientBalance"] === "number" ? me["clientBalance"] : null,
      spendPerHrUsd:
        typeof me["currentSpendPerHr"] === "number" ? me["currentSpendPerHr"] : null,
    };
  } catch {
    return null;
  }
}

/** Whether the model service on the server says it can generate. No token needed. */
async function serviceReady(podId: string): Promise<boolean> {
  try {
    const res = await fetch(`${inferenceUrl(podId)}/health`, {
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

/** The Lab's GPU address, as Coolify holds it. Every other setting is dropped here. */
async function labUrl(coolify: string): Promise<string | null> {
  try {
    const r = await call(
      `${LAB_GPU_LAUNCH.coolifyBase}/api/v1/applications/${LAB_GPU_LAUNCH.coolifyApp}/envs`,
      coolify,
    );
    if (!r.ok || !Array.isArray(r.body)) return null;
    for (const row of r.body as Record<string, unknown>[]) {
      if (row["key"] === LAB_URL_KEY && row["is_preview"] === false) {
        return typeof row["value"] === "string" ? row["value"] : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Point the Lab at a server and restart it so it reads the new address. */
async function pointLab(coolify: string, podId: string): Promise<Reply> {
  const base = `${LAB_GPU_LAUNCH.coolifyBase}/api/v1`;
  const set = await call(
    `${base}/applications/${LAB_GPU_LAUNCH.coolifyApp}/envs/bulk`,
    coolify,
    "PATCH",
    {
      data: [
        {
          key: LAB_URL_KEY,
          value: inferenceUrl(podId),
          is_preview: false,
          is_literal: true,
          is_buildtime: false,
          is_runtime: true,
        },
      ],
    },
  );
  if (!set.ok) return set;
  // A deploy, not a restart: on 2026-10-24 only a deploy made the Lab read a
  // changed setting. With no code change Coolify skips the build (~1 minute).
  return call(`${base}/deploy?uuid=${LAB_GPU_LAUNCH.coolifyApp}`, coolify, "POST");
}

export async function labGpuStatus(): Promise<LabGpuStatus> {
  const { runpod, coolify } = await keys();
  const coolifyConnected = coolify !== null;
  if (!runpod) {
    return decideStatus({
      connected: false,
      coolifyConnected,
      pods: [],
      account: null,
      serviceReady: null,
      labPointsHere: null,
    });
  }
  let pods: PodSummary[];
  try {
    pods = await listPods(runpod);
  } catch (error) {
    return decideStatus({
      connected: true,
      coolifyConnected,
      pods: null,
      account: null,
      serviceReady: null,
      labPointsHere: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const pod = findLabPod(pods);
  const [acct, ready, url] = await Promise.all([
    account(runpod),
    pod ? serviceReady(pod.id) : Promise.resolve(null),
    pod && coolify ? labUrl(coolify) : Promise.resolve(null),
  ]);
  return decideStatus({
    connected: true,
    coolifyConnected,
    pods,
    account: acct,
    serviceReady: ready,
    labPointsHere: pod && url !== null ? url === inferenceUrl(pod.id) : null,
    now: Date.now(),
  });
}

export interface SwitchResult {
  ok: boolean;
  message: string;
  detail?: string;
}

async function removeAll(
  runpod: string,
  pods: readonly PodSummary[],
): Promise<string[]> {
  const failed: string[] = [];
  for (const p of labPods(pods)) {
    const r = await call(`${REST}/pods/${p.id}`, runpod, "DELETE");
    if (!r.ok) failed.push(`${p.id}: ${r.text.slice(0, 200)}`);
  }
  return failed;
}

/** Turn the Lab GPU on (create a server, point the Lab at it) or off (delete it). */
export async function switchLabGpu(to: "on" | "off"): Promise<SwitchResult> {
  const { runpod, coolify } = await keys();
  if (!runpod) {
    return {
      ok: false,
      message:
        "The console is not connected to RunPod. Paste your RunPod key on the Connect page.",
    };
  }
  let pods: PodSummary[];
  try {
    pods = await listPods(runpod);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: explainRunpodError(detail), detail };
  }

  if (to === "off") {
    const failed = await removeAll(runpod, pods);
    return failed.length === 0
      ? {
          ok: true,
          message:
            'Switched off. The server is deleted and no card is billing; your model and add-ons stay on the shared storage. Don\'t pick "Self-hosted GPU" in the Lab until you switch it back on.',
        }
      : {
          ok: false,
          message:
            "RunPod did not delete every Lab server, so one may still be billing. Tell Claude.",
          detail: failed.join("\n"),
        };
  }

  if (!coolify) {
    return {
      ok: false,
      message:
        "Paste your Coolify key on the Connect page first: each Turn on makes a new server, and the console has to point the Lab at it.",
    };
  }
  if (findLabPod(pods)) {
    return {
      ok: true,
      message: "It is already on. Refresh to see whether it is ready.",
    };
  }
  // A stopped server from the old design still bills for its own disk.
  await removeAll(runpod, pods);

  const created = await call(`${REST}/pods`, runpod, "POST", createPodBody());
  const id = (created.body as { id?: unknown } | null)?.id;
  if (!created.ok || typeof id !== "string") {
    return {
      ok: false,
      message: explainRunpodError(created.text),
      detail: created.text.slice(0, 500),
    };
  }

  const pointed = await pointLab(coolify, id);
  if (!pointed.ok) {
    // A server the Lab cannot reach only costs money. Take it down again.
    await call(`${REST}/pods/${id}`, runpod, "DELETE");
    return {
      ok: false,
      message:
        "The server started, but Coolify refused to point the Lab at it, so the console deleted it again and nothing is billing. Check the Coolify key on the Connect page, or tell Claude.",
      detail: pointed.text.slice(0, 500),
    };
  }
  const rate = (created.body as { costPerHr?: unknown }).costPerHr;
  return {
    ok: true,
    message: `Switched on${typeof rate === "number" ? ` at $${rate.toFixed(2)} an hour` : ""}, and the Lab is being pointed at it. Refresh this page to see when it is ready; allow up to ${String(STUCK_AFTER_MINUTES)} minutes.`,
  };
}
