"use client";

import type { Operation, Snapshot } from "@hl-bos/tms";

export class ApiError extends Error {}

export async function fleetCall<T = unknown>(
  op: Operation,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch("/api/fleet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, args }),
  });
  const body = (await res.json()) as { result?: T; error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`);
  return body.result as T;
}

/**
 * Read-modify-write of the whole fleet document, the way production's
 * save_fleet expects: send the revision you read; if someone saved in
 * between, the backend answers changes:0 and nothing is written.
 */
export async function saveFleet(
  mutate: (f: NonNullable<Snapshot["state"]["payload"]>) => void,
): Promise<void> {
  const s = await fleetCall<Snapshot>("snapshot");
  const f = structuredClone(
    s.state.payload ?? {
      assets: [],
      work: [],
      fuel: [],
      drivers: [],
      driverEvents: [],
      policy: { days: 7, daily: true },
    },
  );
  mutate(f);
  const r = await fleetCall<{ changes: number }>("save_fleet", {
    revision: s.state.revision,
    fleet: f,
  });
  if (r.changes !== 1)
    throw new ApiError(
      "Someone else saved changes at the same time. Reload and try again.",
    );
}
