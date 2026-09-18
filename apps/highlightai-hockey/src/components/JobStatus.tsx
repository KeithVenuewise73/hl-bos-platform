import {
  PIPELINE_ORDER,
  describeStatus,
  progressFraction,
  type ProcessingJob,
} from "@hl-bos/hockey-highlights";

/**
 * Where this job is, in the user's language.
 *
 * Progress is derived from the job's position in the pipeline, never stored. A
 * stored percentage is a second source of truth and drifts from the first — and
 * a progress bar that disagrees with the stage label is how a user concludes
 * the whole screen is guessing.
 */
export function JobStatus({ job }: { job: ProcessingJob }) {
  const copy = describeStatus(job.status);
  const failed = job.status === "failed";
  const percent = Math.round(progressFraction(job.status) * 100);

  return (
    <div className={`job ${failed ? "job-failed" : ""}`}>
      <div className="job-head">
        <strong>{copy.label}</strong>
        {!failed && <span className="job-percent">{percent}%</span>}
      </div>
      <p>{copy.detail}</p>

      {!failed && (
        <ol className="stages">
          {PIPELINE_ORDER.map((stage) => {
            const here = PIPELINE_ORDER.indexOf(job.status);
            const index = PIPELINE_ORDER.indexOf(stage);
            const state = index < here ? "done" : index === here ? "current" : "todo";
            return (
              <li key={stage} className={`stage stage-${state}`}>
                {describeStatus(stage).label}
              </li>
            );
          })}
        </ol>
      )}

      {failed && job.failure !== null && (
        <div className="failure">
          <p>
            It stopped during <strong>{describeStatus(job.failure.stage).label}</strong>
            .
          </p>
          <p>{job.failure.detail}</p>
          <p className="footnote">
            {job.failure.retryable
              ? "Trying again may work."
              : // Saying this plainly is the point. A Try Again button that
                // cannot work is worse than no button, because it reads as a
                // remedy that is not there.
                "Trying again would fail the same way, so it is not offered."}
            {job.attempt > 0 && ` This was attempt ${job.attempt + 1}.`}
          </p>
        </div>
      )}

      {job.attempt > 0 && !failed && (
        <p className="footnote">
          Retried {job.attempt} time{job.attempt === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
