/**
 * What the page and the server say to each other. Plain data, no server code,
 * so the page can import it.
 */

export type Camera = "A" | "B";

/** One piece of the finished video, as shown for review. */
export interface PickRow {
  readonly n: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly lengthSeconds: number;
  readonly camera: Camera;
  /** What the person called it (highlights), or "". */
  readonly label: string;
}

/** Everything about a plan that the page needs to show it. The full plan stays on the server. */
export interface PlanSummary {
  readonly planId: string;
  readonly mode: "broadcast" | "times";
  readonly names: { readonly a: string; readonly b: string | null };
  readonly hasSecondCamera: boolean;
  /** Length of the whole recording on the game timeline. */
  readonly gameSeconds: number;
  /** Length of the finished video, before the pieces are cut. */
  readonly keptSeconds: number;
  readonly switches: number;
  readonly offsetSeconds: number | null;
  readonly confidence: number | null;
  readonly rows: readonly PickRow[];
  readonly notes: readonly string[];
  readonly skipped: readonly {
    readonly line: number;
    readonly seconds: number;
    readonly why: string;
  }[];
  readonly problems: readonly {
    readonly line: number;
    readonly text: string;
    readonly why: string;
  }[];
}

export interface MakeSummary {
  readonly outFile: string;
  readonly seconds: number;
  readonly bytes: number;
  readonly quality: "full" | "draft";
}

export type JobResult =
  | { readonly kind: "plan"; readonly plan: PlanSummary }
  | { readonly kind: "make"; readonly made: MakeSummary };

export type JobState = "running" | "done" | "failed" | "cancelled";

/** The one job on this computer, as the page sees it. */
export interface JobSnapshot {
  readonly id: number;
  readonly kind: "plan" | "make";
  readonly label: string;
  readonly state: JobState;
  /** What it is doing right now, in words. */
  readonly step: string;
  /** 0 to 1. */
  readonly fraction: number;
  readonly startedAt: number;
  readonly endedAt: number | null;
  /** Why it failed, in plain words. */
  readonly error: string | null;
  readonly result: JobResult | null;
  /** Whether Windows agreed to stay awake for it; null until known. */
  readonly awake: boolean | null;
}

export interface ToolStatus {
  readonly found: boolean;
  readonly path: string | null;
  readonly hdrConversion: boolean | null;
  readonly message: string;
}
