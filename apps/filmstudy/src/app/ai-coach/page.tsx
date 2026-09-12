import { getViewer } from "@/lib/session";
import { listTeamPlays } from "@/lib/data";
import { Card, Notice, PageHead, PhasePage } from "@/components/ui";
import { NoTeam } from "@/components/no-team";

export const dynamic = "force-dynamic";

const SAMPLE_QUESTIONS = [
  "What are our biggest defensive problems?",
  "Show all explosive plays.",
  "Show every snap for #24.",
  "What formations did the opponent use most?",
  "How did we defend Trips?",
  "Where are missed tackles happening?",
];

/**
 * The AI Coach.
 *
 * There is no conversational inference layer in Phase 1, so there is no chat
 * box here. A text input that produced canned answers, or answers from a model
 * with no access to this team's confirmed film, would be exactly the thing the
 * platform's tenth principle forbids — and worse here than anywhere, because a
 * coach would act on it.
 *
 * What IS shown is honest: how many confirmed plays this team actually has,
 * because that number is what decides whether the AI Coach will be able to
 * answer anything when it does arrive. And the search that works today is one
 * click away.
 */
export default async function AiCoachPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;

  const plays = await listTeamPlays(viewer.team.id);
  const charted = plays.filter(
    (p) => p.formation !== null || p.concept !== null,
  ).length;

  return (
    <>
      <PageHead title="FilmStudy AI Coach" />

      <Notice>
        <strong>There is no chat box on this page yet, and that is deliberate.</strong>{" "}
        The AI Coach answers questions from your team&rsquo;s confirmed film. FilmStudy
        has no inference layer running, so anything it said now would be either canned
        or invented &mdash; and a coach would act on it.
      </Notice>

      <Card
        title="What this team has to answer from"
        sub="The figure that decides whether the AI Coach can say anything useful"
      >
        <div className="grid grid-3">
          <div className="tile">
            <div className={plays.length === 0 ? "tile-value muted" : "tile-value"}>
              {plays.length === 0 ? "None yet" : plays.length}
            </div>
            <div className="tile-label">Plays segmented</div>
          </div>
          <div className="tile">
            <div className={charted === 0 ? "tile-value muted" : "tile-value"}>
              {charted === 0 ? "None yet" : charted}
            </div>
            <div className="tile-label">Plays with football tags</div>
            <div className="tile-hint">Formation or concept confirmed by a coach</div>
          </div>
          <div className="tile">
            <div className="tile-value muted">Phase 2</div>
            <div className="tile-label">Conversational answers</div>
          </div>
        </div>
        <p className="dim small" style={{ marginTop: 12, marginBottom: 0 }}>
          Until then,{" "}
          <a href="/search" style={{ color: "var(--accent)" }}>
            Find Plays
          </a>{" "}
          answers the structured half of these questions today, over exactly this
          confirmed data, and tells you which of your words it did not understand.
        </p>
      </Card>

      <PhasePage
        phase={2}
        title="Ask your film a question"
        what={`Questions such as "${SAMPLE_QUESTIONS[0]}" or "${SAMPLE_QUESTIONS[2]}", answered with a short explanation, the statistics behind it, and the actual clips — citing real play numbers, never invented ones.`}
        blockedBy={[
          "Enough confirmed tags to answer from. When the data is thin the answer has to be “FilmStudy AI does not yet have enough confirmed data to answer this reliably”, and that refusal is already built into @hl-bos/football.",
          "An embedding index over coach notes, play descriptions and AI observations, so semantic questions reach the right plays.",
          "A provider-neutral inference service. The platform's AI gateway already exists and must not be bypassed, so the AI Coach goes through it rather than calling a vendor directly.",
        ]}
      />
    </>
  );
}
