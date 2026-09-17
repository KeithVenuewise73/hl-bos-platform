import { recordValueFeedback } from "@/lib/actions.ts";

/**
 * "Did this help?"
 *
 * Three buttons, no free-text box. The answer is the only thing stored, and
 * the reason for keeping it to three fixed words is in the events module: a
 * comment field on a page about somebody's resume is a place where somebody's
 * resume ends up in an analytics table.
 *
 * A plain form, so it works with JavaScript switched off like every other
 * control in this app.
 */
export function ValueFeedback({
  stage,
  back,
  answered,
}: {
  stage: "analysis" | "export";
  back: string;
  answered: boolean;
}) {
  if (answered) {
    return (
      <p className="muted small" role="status">
        Thanks — noted.
      </p>
    );
  }
  return (
    <div className="feedback">
      <span className="small">
        {stage === "export"
          ? "Did this resume help you make a stronger application?"
          : "Did this analysis help you improve your application?"}
      </span>
      <form action={recordValueFeedback} className="feedback-row">
        <input type="hidden" name="stage" value={stage} />
        <input type="hidden" name="back" value={back} />
        <button className="btn btn-sm" name="answer" value="yes" type="submit">
          Yes
        </button>
        <button className="btn btn-sm" name="answer" value="somewhat" type="submit">
          Somewhat
        </button>
        <button className="btn btn-sm" name="answer" value="no" type="submit">
          No
        </button>
      </form>
    </div>
  );
}
