import type { JobResult, JobSnapshot } from "./types.ts";

/**
 * One background job at a time, independent of any web page.
 *
 * A two-hour render must not depend on a browser tab staying open: tabs are
 * closed, reloaded and put to sleep. The job lives here, in the server; the page
 * only asks how it is going. Close the page, come back later, and it is still
 * there (or finished, or failed, with the reason).
 *
 * Pure of any process or file work: the work itself is passed in, so the state
 * machine is tested with fake work.
 */

export interface JobContext {
  /** Aborted when the person presses Stop. */
  readonly signal: AbortSignal;
  /** What it is doing, in words. */
  step(message: string): void;
  /** 0 to 1. Never moves backwards. */
  progress(fraction: number): void;
  /** Whether Windows agreed to stay awake. */
  awake(held: boolean): void;
}

type Work = (ctx: JobContext) => Promise<JobResult>;

interface Running extends JobSnapshot {
  state: "running" | "done" | "failed" | "cancelled";
  step: string;
  fraction: number;
  endedAt: number | null;
  error: string | null;
  result: JobResult | null;
  awake: boolean | null;
}

export class JobManager {
  private job: Running | null = null;
  private control: AbortController | null = null;
  private counter = 0;

  constructor(
    private readonly clock: () => number = () => Date.now(),
    /** Turns a thrown error into words for the person. */
    private readonly explain: (e: unknown) => string = (e) =>
      e instanceof Error ? e.message : String(e),
    /** True when a thrown error means "stopped on purpose". */
    private readonly isStop: (e: unknown) => boolean = () => false,
  ) {}

  /** Starts the work. Returns the job's id, or null when another job is still running. */
  start(kind: "plan" | "make", label: string, work: Work): number | null {
    if (this.job?.state === "running") return null;
    const control = new AbortController();
    this.control = control;
    const id = (this.counter += 1);
    const job: Running = {
      id,
      kind,
      label,
      state: "running",
      step: "Starting…",
      fraction: 0,
      startedAt: this.clock(),
      endedAt: null,
      error: null,
      result: null,
      awake: null,
    };
    this.job = job;
    const ctx: JobContext = {
      signal: control.signal,
      step: (m) => {
        if (this.job === job) job.step = m;
      },
      progress: (f) => {
        if (this.job === job)
          job.fraction = Math.max(job.fraction, Math.min(1, Math.max(0, f)));
      },
      awake: (held) => {
        if (this.job === job) job.awake = held;
      },
    };
    void (async () => {
      try {
        const result = await work(ctx);
        if (control.signal.aborted) {
          job.state = "cancelled";
          job.step = "Stopped. Nothing was kept.";
        } else {
          job.state = "done";
          job.fraction = 1;
          job.step = "Done.";
          job.result = result;
        }
      } catch (e) {
        if (control.signal.aborted || this.isStop(e)) {
          job.state = "cancelled";
          job.step = "Stopped. Nothing was kept.";
        } else {
          job.state = "failed";
          job.error = this.explain(e);
          job.step = "Stopped by a problem.";
        }
      } finally {
        job.endedAt = this.clock();
      }
    })();
    return id;
  }

  /** Asks the running job to stop. False when nothing is running. */
  cancel(): boolean {
    if (this.job?.state !== "running" || this.control === null) return false;
    this.control.abort();
    this.job.step = "Stopping…";
    return true;
  }

  /** The current (or last finished) job, as a copy the page can hold. */
  snapshot(): JobSnapshot | null {
    return this.job === null ? null : { ...this.job };
  }

  get running(): boolean {
    return this.job?.state === "running";
  }
}
