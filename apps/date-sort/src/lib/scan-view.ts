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
  /** Which scan this is, for Create Folder (the server keeps the file list). */
  readonly scanId: string;
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

/** One date's outcome after Create Folder, as the page shows it. */
export interface DayCopyView {
  readonly day: string;
  readonly folder: string;
  readonly photos: number;
  readonly copied: number;
  readonly alreadyThere: number;
  readonly renamedCopies: number;
  readonly conflicts: ReadonlyArray<{
    readonly name: string;
    readonly source: string;
    readonly reason: string;
  }>;
  readonly failed: ReadonlyArray<{
    readonly name: string;
    readonly source: string;
    readonly reason: string;
  }>;
}

export type CopyMessage =
  | {
      readonly type: "progress";
      readonly day: string;
      readonly folder: string;
      readonly done: number;
      readonly total: number;
      readonly bytesCopied: number;
    }
  | {
      readonly type: "done";
      readonly days: readonly DayCopyView[];
      readonly seconds: number;
    }
  | { readonly type: "error"; readonly message: string };
