import Link from "next/link";
import { describeFilter, parseFilmQuery } from "@hl-bos/football";
import { getViewer } from "@/lib/session";
import { isStaffRole } from "@/lib/access";
import { listFilm, listParticipation, listPlayers, listTeamPlays } from "@/lib/data";
import { matchPlays } from "@/lib/search";
import { situationLabel } from "@hl-bos/football";
import { timecode } from "@/lib/format";
import { Card, Empty, Notice, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { SearchBox } from "@/components/search-box";

export const dynamic = "force-dynamic";

const SAMPLES = [
  "third and long",
  "explosive runs",
  "Trips Right",
  "Cover 3 on third down",
  "red zone",
  "#24 snaps",
  "11 personnel",
  "turnovers",
];

/**
 * Natural-language film search.
 *
 * The search runs over CONFIRMED tags only. It reports what it understood and,
 * just as prominently, what it did not — so a query that half-matched cannot
 * look like a query that fully matched. That honesty is the difference between
 * a search a coach trusts and one they stop using after the first time it
 * silently ignored half of what they asked.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  if (!isStaffRole(viewer.role)) {
    return (
      <>
        <PageHead title="Find plays" />
        <Notice tone="bad">
          Film search across the whole team is a coaching tool.
        </Notice>
      </>
    );
  }

  const query = (q ?? "").trim();
  const [plays, players, film] = await Promise.all([
    listTeamPlays(viewer.team.id),
    listPlayers(viewer.team.id),
    listFilm(viewer.team.id),
  ]);
  const filmTitle = new Map(film.map((f) => [f.id, f.title]));

  const filter = query.length === 0 ? null : parseFilmQuery(query);
  const participation =
    filter !== null && filter.jerseyNumbers.length > 0
      ? await listParticipation(plays.map((p) => p.id))
      : [];
  const matches =
    filter === null ? [] : matchPlays(plays, filter, players, participation);

  return (
    <>
      <PageHead
        title="Find plays"
        sub="Search confirmed tags across every film on this team"
      />

      <Card>
        <SearchBox initial={query} samples={SAMPLES} />
      </Card>

      {filter === null ? (
        <Empty
          title="Search the film"
          reason={`${plays.length} plays are tagged on this team. Search by formation, concept, coverage, front, personnel, situation or player number.`}
        />
      ) : filter.empty ? (
        <Notice tone="bad">
          <strong>No football terms recognised.</strong> FilmStudy matches the canonical
          vocabulary &mdash; formations, run and pass concepts, coverages, fronts,
          personnel groupings, situations, and a player as{" "}
          <span className="mono">#24</span>. It did not find any of those in &ldquo;
          {query}&rdquo;, so it is not going to show you a result list and let you
          assume it understood.
        </Notice>
      ) : (
        <>
          <Notice tone="accent">
            <strong>Searched for:</strong> {describeFilter(filter)}.{" "}
            {filter.unrecognized.length > 0 ? (
              <>
                <strong>Not understood:</strong> {filter.unrecognized.join(", ")}{" "}
                &mdash; these words were ignored, so these results are narrower than
                what you asked for.
              </>
            ) : null}
          </Notice>

          {matches.length === 0 ? (
            <Empty
              title="No plays match"
              reason={`Nothing in the ${plays.length} tagged plays on this team matches that. Either it did not happen, or it happened and has not been tagged yet.`}
            />
          ) : (
            <Card
              title={`${matches.length} ${matches.length === 1 ? "play" : "plays"}`}
            >
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Play</th>
                      <th>Situation</th>
                      <th>Formation</th>
                      <th>Concept</th>
                      <th>Coverage</th>
                      <th>Result</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((play) => (
                      <tr key={play.id}>
                        <td>
                          <div className="mono small">#{play.play_number}</div>
                          <div className="tiny faint">
                            {filmTitle.get(play.film_asset_id) ?? "film"}
                          </div>
                        </td>
                        <td className="dim small">
                          {situationLabel({
                            ...(play.down !== null ? { down: play.down } : {}),
                            ...(play.distance !== null
                              ? { distance: play.distance }
                              : {}),
                          }) ?? <span className="faint">untagged</span>}
                        </td>
                        <td className="dim small">
                          {play.formation ?? <span className="faint">&mdash;</span>}
                        </td>
                        <td className="dim small">
                          {play.concept ?? <span className="faint">&mdash;</span>}
                        </td>
                        <td className="dim small">
                          {play.coverage ?? <span className="faint">&mdash;</span>}
                        </td>
                        <td className="small">
                          {play.result ??
                            (play.yards === null ? (
                              <span className="faint">&mdash;</span>
                            ) : (
                              `${play.yards} yds`
                            ))}
                        </td>
                        <td>
                          <Link
                            href={`/film/${play.film_asset_id}`}
                            className="btn sm ghost"
                          >
                            {timecode(play.start_seconds)}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
