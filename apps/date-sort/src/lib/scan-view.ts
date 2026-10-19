/**
 * What the page is sent after a scan: the report, plus the short lists a
 * person needs to check (estimated dates, unreadable folders). The full list
 * of every file stays on the server side until a later step needs it.
 *
 * Shared by the scan route (which builds it) and the page (which shows it),
 * so it must stay free of anything Node-only.
 */
import type { DateSource, PhotoFormat, ScanReport } from "@hl-bos/date-sort";

export interface EstimatedPhoto {
  readonly path: string;
  readonly format: PhotoFormat;
  readonly takenAt: string;
}

export interface ScanView {
  readonly root: string;
  readonly includeSubfolders: boolean;
  readonly seconds: number;
  readonly report: ScanReport;
  /** Every photo dated by its file time instead of the camera. */
  readonly estimated: readonly EstimatedPhoto[];
  /** How many photos used each date source. */
  readonly sources: Readonly<Record<DateSource, number>>;
  readonly folderProblems: ReadonlyArray<{
    readonly path: string;
    readonly reason: string;
  }>;
  readonly skippedLinks: readonly string[];
}

export type ScanMessage =
  | {
      readonly type: "progress";
      readonly phase: "listing" | "reading";
      readonly found: number;
      readonly read: number;
    }
  | { readonly type: "done"; readonly view: ScanView }
  | { readonly type: "error"; readonly message: string };
