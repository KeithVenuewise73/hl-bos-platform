"use client";

import Link from "next/link";
import {
  buildTimeline,
  clockText,
  computeGameState,
  materialize,
  spanTotal,
} from "@hl-bos/playtime-engine";
import { Empty, Loading, TopBar } from "@/components/ui";
import { useMounted, useStore } from "@/lib/hooks";
import { game, gameLog, games, team } from "@/lib/store";

/** Every game recorded on this device, newest first. */
export default function HistoryPage() {
  const mounted = useMounted();
  const all = useStore(games);

  if (!mounted) {
    return (
      <main>
        <TopBar back="/" />
        <Loading />
      </main>
    );
  }

  if (all.length === 0) {
    return (
      <main>
        <TopBar back="/" />
        <h1>Game history</h1>
        <Empty
          title="No games yet"
          action={
            <Link className="btn btn-primary" href="/">
              Go to my teams
            </Link>
          }
        >
          Games appear here as soon as you create one — finished or not.
        </Empty>
      </main>
    );
  }

  return (
    <main>
      <TopBar back="/" />
      <h1>Game history</h1>
      <p className="lead">
        {all.length} game{all.length === 1 ? "" : "s"} on this device.
      </p>

      <div className="stack">
        {all.map((g) => (
          <GameRow key={g.id} id={g.id} />
        ))}
      </div>
    </main>
  );
}

function GameRow({ id }: { id: string }) {
  const g = useStore(() => game(id));
  const events = useStore(() => gameLog(id));
  const t = useStore(() => (g ? team(g.teamId) : undefined));
  if (g === undefined) return null;

  const timeline = buildTimeline(events);
  const elapsed = Math.round(
    spanTotal(materialize(timeline.running, Date.now())) / 1000,
  );
  const finished = timeline.phase === "final";
  const started = timeline.phase !== "scheduled";

  const state = computeGameState({
    gameId: g.id,
    rosterPlayerIds: g.rosterPlayerIds,
    periodCount: g.periodCount,
    periodSeconds: g.periodSeconds,
    minimum: g.minimum,
    events,
    now: Date.now(),
  });
  const short = state.participation.filter((p) => p.status === "below_target").length;

  return (
    <Link
      href={started && !finished ? `/game/?id=${g.id}` : `/report/?id=${g.id}`}
      className="card"
      style={{ color: "inherit", textDecoration: "none", display: "block" }}
    >
      <div className="row">
        <div className="grow">
          <strong>{g.opponent ? `vs ${g.opponent}` : "No opponent recorded"}</strong>
          <div className="muted">
            {g.gameDate} · {t?.name ?? "Team no longer on this device"}
          </div>
        </div>
        <div className="figures" style={{ textAlign: "right" }}>
          <div className="tabular">
            <strong>{clockText(elapsed)}</strong>
          </div>
          <div className="muted">
            {g.score ? `${g.score.us} – ${g.score.them}` : "No score"}
          </div>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        {!started
          ? "Not started"
          : !finished
            ? "In progress — tap to return to the tracker"
            : g.minimum.kind === "none"
              ? `${state.participation.filter((p) => p.secondsPlayed > 0).length} athletes played`
              : short === 0
                ? "Every athlete met the minimum"
                : `${short} athlete${short === 1 ? "" : "s"} below the minimum`}
      </div>
    </Link>
  );
}
