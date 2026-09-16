"use client";

import Link from "next/link";
import { buildTimeline, SPORT_LABEL, clockText } from "@hl-bos/playtime-engine";
import { Empty, InfoNote, Loading, TopBar } from "@/components/ui";
import { SyncStatus } from "@/components/SyncStatus";
import { useAuth } from "@/lib/auth";
import { useMounted, useStore } from "@/lib/hooks";
import { gameLog, games, players, teams } from "@/lib/store";
import { storageAvailable } from "@/lib/storage";

/**
 * Home.
 *
 * Its first job is to get a coach back into a game that is already running.
 * Somebody who backgrounded the app at halftime and reopened it should reach
 * the tracker in one tap, not navigate a menu with a whistle in their mouth.
 */
export default function HomePage() {
  const mounted = useMounted();
  const { state } = useAuth();
  const myTeams = useStore(teams);
  const allGames = useStore(games);

  if (!mounted) {
    return (
      <main>
        <TopBar title="PlayTime Tracker" />
        <Loading />
      </main>
    );
  }

  if (!storageAvailable()) {
    return (
      <main>
        <h1>This device will not let the app save anything</h1>
        <p>
          PlayTime Tracker stores your teams and games in this browser&rsquo;s storage. It is
          currently blocked — private browsing and blocked site data are the usual causes.
        </p>
        <p>
          Nothing will be recorded until that is changed, so the app has stopped rather than let
          you track a game it cannot keep.
        </p>
      </main>
    );
  }

  const live = allGames.find((g) => {
    const phase = buildTimeline(gameLog(g.id)).phase;
    return phase !== "scheduled" && phase !== "final";
  });

  return (
    <main>
      <TopBar
        title="PlayTime Tracker"
        action={
          <Link className="btn btn-small" href="/account/">
            Account
          </Link>
        }
      />

      {live ? (
        <div className="card" style={{ borderColor: "var(--on)", borderWidth: 2 }}>
          <strong>A game is in progress</strong>
          <p className="muted" style={{ margin: "4px 0 12px" }}>
            {live.opponent ? `vs ${live.opponent}` : "Untitled game"} ·{" "}
            {clockText(
              // Elapsed is derived from the log, so this is accurate even if
              // the app has been closed since the last tap.
              Math.round(
                buildTimeline(gameLog(live.id)).running.reduce(
                  (acc, s) => acc + ((s.end ?? Date.now()) - s.start),
                  0,
                ) / 1000,
              ),
            )}{" "}
            played
          </p>
          <Link className="btn btn-primary btn-block" href={`/game/?id=${live.id}`}>
            Return to the game
          </Link>
        </div>
      ) : null}

      {state.status === "signed-out" ? (
        <InfoNote>
          You are not signed in. Everything works and is saved on this device —{" "}
          <Link href="/login/">sign in</Link> whenever you want your games backed up.
        </InfoNote>
      ) : null}

      <h2>My teams</h2>

      {myTeams.length === 0 ? (
        <Empty
          title="No teams yet"
          action={
            <Link className="btn btn-primary" href="/team/">
              Create a team
            </Link>
          }
        >
          A team holds your roster. You can add players and start tracking a game in about a
          minute.
        </Empty>
      ) : (
        <div className="stack">
          {myTeams.map((t) => {
            const roster = players(t.id).filter((p) => p.active);
            const played = allGames.filter((g) => g.teamId === t.id).length;
            return (
              <Link key={t.id} href={`/team/?id=${t.id}`} className="card row" style={{ color: "inherit", textDecoration: "none" }}>
                <div className="grow">
                  <strong>{t.name}</strong>
                  <div className="muted">
                    {SPORT_LABEL[t.sport]} · {roster.length} player{roster.length === 1 ? "" : "s"} ·{" "}
                    {played} game{played === 1 ? "" : "s"}
                  </div>
                </div>
                <span aria-hidden="true" className="muted">
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 16 }}>
        {myTeams.length > 0 ? (
          <Link className="btn" href="/team/">
            New team
          </Link>
        ) : null}
        <Link className="btn" href="/history/">
          Game history
        </Link>
      </div>

      <SyncStatus />
    </main>
  );
}
