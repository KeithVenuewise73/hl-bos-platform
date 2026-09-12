import { getViewer } from "@/lib/session";
import { ROLE_LABEL, can } from "@/lib/access";
import { listGradeCategories, listSeasons } from "@/lib/data";
import { Card, Notice, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { TeamSwitcher } from "@/components/team-switcher";
import { ProgramSettings } from "@/components/program-settings";
import { DemoControls } from "@/components/demo-controls";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;

  const [seasons, categories] = await Promise.all([
    listSeasons(team.id),
    listGradeCategories(team.id),
  ]);
  const hasDemo = viewer.teams.some((t) => t.is_demo);

  return (
    <>
      <PageHead title="Settings" sub={team.name}>
        <TeamSwitcher teams={viewer.teams} currentId={team.id} />
      </PageHead>

      <Card title="You">
        <dl style={{ margin: 0 }}>
          <div className="row between" style={{ padding: "4px 0" }}>
            <dt className="tiny faint">Signed in as</dt>
            <dd style={{ margin: 0 }}>{viewer.email ?? "unknown"}</dd>
          </div>
          <div className="row between" style={{ padding: "4px 0" }}>
            <dt className="tiny faint">Role on this team</dt>
            <dd style={{ margin: 0 }}>
              {viewer.role === null ? "Not on this team" : ROLE_LABEL[viewer.role]}
            </dd>
          </div>
          <div className="row between" style={{ padding: "4px 0" }}>
            <dt className="tiny faint">Teams</dt>
            <dd style={{ margin: 0 }}>{viewer.teams.length}</dd>
          </div>
        </dl>
      </Card>

      {can(viewer.role, "manage_program") ? (
        <ProgramSettings
          teamId={team.id}
          gradeScale={team.grade_scale}
          athletesSeeGrades={team.athletes_see_grades}
          guardianAccess={team.guardian_access}
          guardiansSeeGrades={team.guardians_see_grades}
        />
      ) : (
        <Notice>
          Program settings — grading scale and what athletes and guardians can see — are
          set by the head coach or organization admin.
        </Notice>
      )}

      <Card title="Grading categories" sub="What every rep is graded on">
        <div className="row">
          {categories.map((category) => (
            <span key={category.id} className="badge">
              {category.label}
            </span>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 10, marginBottom: 0 }}>
          Every team starts with Assignment, Technique, Effort and Execution.
          Coach-created categories are stored per team; adding them from this screen
          arrives with the settings work in Phase 2.
        </p>
      </Card>

      <Card title="Seasons">
        {seasons.length === 0 ? (
          <p className="dim small" style={{ margin: 0 }}>
            No seasons yet. Film and games work without one; a season is what groups
            them for a year-over-year view later.
          </p>
        ) : (
          <div className="row">
            {seasons.map((season) => (
              <span
                key={season.id}
                className={season.is_current ? "badge accent" : "badge"}
              >
                {season.label}
                {season.is_current ? " · current" : ""}
              </span>
            ))}
          </div>
        )}
      </Card>

      {can(viewer.role, "manage_program") ? (
        <DemoControls tenantId={team.tenant_id} hasDemo={hasDemo} />
      ) : null}
    </>
  );
}
