import { Card, Empty, Notice } from "./ui";
import { DemoControls } from "./demo-controls";
import type { Viewer } from "@/lib/types";

/**
 * What a signed-in user sees when they are on no team.
 *
 * This is a real and common state — a coach whose account exists before anyone
 * has put them on a roster — and it is not an error. It says what is missing
 * and who can fix it, rather than showing an empty dashboard that looks broken.
 */
export function NoTeam({ viewer }: { viewer: Viewer }) {
  const organizationId = viewer.teams[0]?.tenant_id ?? null;

  return (
    <>
      <h1>Football FilmStudy AI</h1>
      <p className="page-sub" style={{ marginBottom: 20 }}>
        Upload the film. Understand the game. Coach the next rep.
      </p>

      <Card title="You are not on a team yet">
        <Empty
          title="No film to show"
          reason={
            "Your account is signed in, but it is not on any team's staff or roster. " +
            "Film, plays and grades all belong to a team, so until someone adds you to one " +
            "there is genuinely nothing here — and showing you a sample dashboard instead " +
            "would be inventing a program that does not exist."
          }
        />
        <Notice tone="accent">
          <strong>Who can fix this:</strong> an organization admin or head coach adds
          you in Settings. If you are setting up a new program, you need the{" "}
          <span className="mono">filmstudy.team.manage</span> permission in your
          organization to create the first team.
        </Notice>
      </Card>

      {organizationId !== null ? (
        <DemoControls tenantId={organizationId} hasDemo={false} />
      ) : null}
    </>
  );
}
