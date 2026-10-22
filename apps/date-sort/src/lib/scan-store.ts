import "server-only";

import type { ScanResult } from "@hl-bos/date-sort/scan";

import type { ScanView } from "./scan-view";

/**
 * The most recent scans, kept in memory so Create Folder can copy exactly
 * the photos the screen shows, without scanning thousands of files again.
 * Nothing is written to disk. A restart forgets them: the page then says to
 * scan again.
 *
 * The latest scan's report is kept too, so reloading the page (which a
 * frozen copy once forced) shows it again instead of costing a fresh scan.
 */
const KEEP = 3;
const scans = new Map<string, ScanResult>();

export function rememberScan(result: ScanResult): string {
  const id = crypto.randomUUID();
  scans.set(id, result);
  while (scans.size > KEEP) scans.delete(scans.keys().next().value!);
  return id;
}

export function findScan(id: string): ScanResult | undefined {
  return scans.get(id);
}

let latest: ScanView | null = null;

export function rememberView(view: ScanView): ScanView {
  latest = view;
  return view;
}

/** The last finished scan's report, while DateSort still has its photos. */
export function latestView(): ScanView | null {
  return latest !== null && scans.has(latest.scanId) ? latest : null;
}
