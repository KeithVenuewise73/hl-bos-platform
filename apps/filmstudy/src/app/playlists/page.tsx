import Link from "next/link";
import { getViewer } from "@/lib/session";
import { can, isStaffRole } from "@/lib/access";
import { listClips, listFilm, listPlaylists } from "@/lib/data";
import { shortDate, timecode } from "@/lib/format";
import { Badge, Card, Empty, Notice, PageHead } from "@/components/ui";
import { NoTeam } from "@/components/no-team";
import { PlaylistForm } from "@/components/playlist-form";

export const dynamic = "force-dynamic";

/**
 * Cutups: clips and the collections they go in.
 *
 * Section 20 also asks for "create a playlist of every opponent blitz" — an AI
 * generated collection. That needs confirmed opponent tags and an inference
 * layer, neither of which exists in Phase 1, so this page says so rather than
 * offering a button that would produce an empty or invented list.
 */
export default async function PlaylistsPage() {
  const viewer = await getViewer();
  if (viewer.team === null) return <NoTeam viewer={viewer} />;
  const team = viewer.team;
  const staff = isStaffRole(viewer.role);

  const [playlists, clips, film] = await Promise.all([
    listPlaylists(team.id),
    listClips(team.id),
    listFilm(team.id),
  ]);
  const filmTitle = new Map(film.map((f) => [f.id, f.title]));

  return (
    <>
      <PageHead
        title="Cutups"
        sub={`${playlists.length} ${playlists.length === 1 ? "collection" : "collections"} · ${clips.length} clips`}
      />

      {playlists.length === 0 ? (
        <Empty
          title="No cutups yet"
          reason={
            staff
              ? "A cutup is a named collection of plays or clips — Third Down Defense, Explosive Runs, OLB Teaching Clips. Create one below, then add plays to it from the film room."
              : "Your coaches have not shared any film collections with you yet."
          }
        />
      ) : (
        <Card>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Cutup</th>
                  <th>Description</th>
                  <th>Built by</th>
                  <th>Shared</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {playlists.map((playlist) => (
                  <tr key={playlist.id}>
                    <td style={{ fontWeight: 600 }}>{playlist.name}</td>
                    <td className="dim small">
                      {playlist.description ?? <span className="faint">&mdash;</span>}
                    </td>
                    <td>
                      <Badge
                        tone={playlist.generated_by === "coach" ? "neutral" : "accent"}
                      >
                        {playlist.generated_by === "coach" ? "Coach" : "FilmStudy AI"}
                      </Badge>
                    </td>
                    <td>
                      {playlist.shared_with_athletes ? (
                        <Badge tone="accent">Squad</Badge>
                      ) : (
                        <span className="tiny faint">Coaches only</span>
                      )}
                    </td>
                    <td className="dim nowrap">{shortDate(playlist.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {clips.length > 0 ? (
        <Card title="Clips" sub="Trimmed from plays in the film room">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Clip</th>
                  <th>Film</th>
                  <th>In / out</th>
                  <th>Speed</th>
                </tr>
              </thead>
              <tbody>
                {clips.map((clip) => (
                  <tr key={clip.id}>
                    <td>
                      <Link
                        href={`/film/${clip.film_asset_id}`}
                        style={{ fontWeight: 600 }}
                      >
                        {clip.title}
                      </Link>
                      {clip.caption !== null ? (
                        <div className="tiny faint">{clip.caption}</div>
                      ) : null}
                    </td>
                    <td className="dim small">
                      {filmTitle.get(clip.film_asset_id) ?? "film"}
                    </td>
                    <td className="mono small">
                      {timecode(clip.start_seconds)}&ndash;{timecode(clip.end_seconds)}
                    </td>
                    <td className="mono small">{clip.playback_rate}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {can(viewer.role, "make_clips") ? (
        <>
          <Card title="Create a cutup">
            <PlaylistForm teamId={team.id} />
          </Card>
          <Notice>
            <strong>
              &ldquo;Build me a cutup of every opponent blitz&rdquo; is Phase 2.
            </strong>{" "}
            FilmStudy could assemble that collection today only by guessing which plays
            were blitzes. It needs confirmed pressure tags on opponent film first, and
            then the collection still comes to you for approval before anyone else sees
            it.
          </Notice>
        </>
      ) : null}
    </>
  );
}
