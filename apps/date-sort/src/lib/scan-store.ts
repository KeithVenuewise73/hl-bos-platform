import "server-only";

import type { ScanResult } from "@hl-bos/date-sort/scan";

/**
 * The most recent scans, kept in memory so Create Folder can copy exactly
 * the photos the screen shows, without scanning thousands of files again.
 * Nothing is written to disk. A restart forgets them: the page then says to
 * scan again.
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
