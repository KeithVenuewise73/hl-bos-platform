"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  clockText,
  computeGameState,
  minimumText,
  percentText,
  periodLabel,
  playerLabel,
  PERIOD_NOUN,
  type PlayerParticipation,
} from "@hl-bos/playtime-engine";
import { Confirm } from "@/components/Confirm";
import { SyncStatus } from "@/components/SyncStatus";
import {
  Empty,
  ErrorNote,
  Loading,
  StatusPill,
  TopBar,
  WarnNote,
} from "@/components/ui";
import { useMounted, useNow, useQueryParam, useStore } from "@/lib/hooks";
import { game, gameLog, player, recordEvent, team } from "@/lib/store";
import { StorageFullError } from "@/lib/storage";

/**
 * The live tracker. This is the product.
 *
 * It must work outdoors, in one hand, while its user is watching a game and
 * not a phone. So: large cards, enormous jersey numbers, ON and BENCH
 * distinguished by fill AND border AND words, and no menu between the coach
 * and a substitution.
 *
 * Every number on this screen is recomputed from the event log on each paint.
 * Nothing is accumulated between renders, which is why leaving the screen,
 * locking the phone or having the app killed outright changes none of it.
 */
function GameScreen() {
  const mounted = useMounted();
  const id = useQueryParam("id");

  if (!mounted || id === null) {
    return (
      <main>
        <TopBar back="/" />
        <Loading />
      </main>
    );
  }
  return <Tracker gameId={id} />;
}

function Tracker({ gameId }: { gameId: string }) {
  const router = useRouter();
  const now = useNow(1000);
  const g = useStore(() => game(gameId));
  const events = useStore(() => gameLog(gameId));
  const t = useStore(() => (g ? team(g.teamId) : undefined));
  const [error, setError] = useState<string | null>(null);

  useKeepAwake();

  if (g === undefined) {
    return (
      <main>
        <TopBar back="/" />
        <Empty title="That game is not on this device">
          It may have been deleted, or recorded under a different account.
        </Empty>
      </main>
    );
  }

  const sport = t?.sport ?? "other";
  const state = computeGameState({
    gameId: g.id,
    rosterPlayerIds: g.rosterPlayerIds,
    periodCount: g.periodCount,
    periodSeconds: g.periodSeconds,
    minimum: g.minimum,
    events,
    now,
  });

  const tap = (fn: () => void) => {
    try {
      fn();
      setError(null);
    } catch (err) {
      setError(
        err instanceof StorageFullError
          ? err.message
          : "That tap was not saved. Check this device's storage before continuing.",
      );
    }
  };

  // Each list is ordered by the decision it exists to support.
  //
  // On the field: most minutes first — the athlete you are most likely to take
  // off is the one at the top. On the bench: FEWEST minutes first, because the
  // whole point of this product is noticing the child who has not played. The
  // engine returns one list sorted by time played; sorting the bench the same
  // way would put the athlete who needs it least under the coach's thumb.
  const onField = state.participation.filter((p) => p.onField);
  const bench = state.participation
    .filter((p) => !p.onField)
    .slice()
    .reverse();
  const noun = PERIOD_NOUN[sport];
  const running = state.phase === "running";
  const finished = state.phase === "final";

  return (
    <main>
      <TopBar
        back="/"
        action={
          <Link className="btn btn-small" href={`/report/?id=${g.id}`}>
            Report
          </Link>
        }
      />

      <div className="row" style={{ marginBottom: 8 }}>
        <div className="grow">
          <strong>{t?.name ?? "Team"}</strong>
          <div className="muted">
            {g.opponent ? `vs ${g.opponent}` : "No opponent recorded"}
          </div>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className={`clock${running ? "" : " paused"}`}>
        <div className="time">{clockText(state.elapsedSeconds)}</div>
        <div className="meta">
          <div className="period">
            {periodLabel(sport, state.currentPeriod)}
            {state.phase === "paused" ? " · Clock stopped" : ""}
            {state.phase === "period_break" ? " · Between periods" : ""}
            {finished ? " · Final" : ""}
          </div>
          <div className="counts">
            {onField.length} on the field · {bench.length} on the bench ·{" "}
            {clockText(state.periodElapsedSeconds)} this {noun.toLowerCase()}
          </div>
        </div>
      </div>

      {state.phase === "scheduled" ? (
        <WarnNote>
          The clock has not started. Tap athletes now to set your starting lineup, then
          press START GAME.
        </WarnNote>
      ) : null}

      {state.phase === "paused" ? (
        <WarnNote>The clock is stopped. Nobody is accruing playing time.</WarnNote>
      ) : null}

      {finished ? (
        <div className="card">
          <strong>This game is finished.</strong>
          <p className="muted" style={{ marginTop: 4 }}>
            The log is closed and the totals below are final.
          </p>
          <Link className="btn btn-primary btn-block" href={`/report/?id=${g.id}`}>
            Open the playtime report
          </Link>
        </div>
      ) : null}

      <h2>On the field</h2>
      {onField.length === 0 ? (
        <p className="muted">
          Nobody is on the field. Tap an athlete below to send them on.
        </p>
      ) : (
        <div className="players">
          {onField.map((p) => (
            <PlayerTile
              key={p.playerId}
              p={p}
              disabled={finished}
              onTap={() =>
                tap(() =>
                  recordEvent(g.id, { type: "player_out", playerId: p.playerId }),
                )
              }
            />
          ))}
        </div>
      )}

      <h2>Bench</h2>
      {bench.length > 1 ? (
        <p className="muted" style={{ marginTop: -4 }}>
          Least playing time first.
        </p>
      ) : null}
      {bench.length === 0 ? (
        <p className="muted">Everyone available is on the field.</p>
      ) : (
        <div className="players">
          {bench.map((p) => (
            <PlayerTile
              key={p.playerId}
              p={p}
              disabled={finished}
              onTap={() =>
                tap(() =>
                  recordEvent(g.id, { type: "player_in", playerId: p.playerId }),
                )
              }
            />
          ))}
        </div>
      )}

      {g.minimum.kind !== "none" ? (
        <p className="muted" style={{ marginTop: 14 }}>
          {minimumText(g.minimum)}. This is your own target, not a league ruling.
        </p>
      ) : null}

      {!finished ? (
        <div className="sticky-actions stack">
          {state.phase === "scheduled" ? (
            <button
              type="button"
              className="btn-primary btn-block"
              onClick={() => tap(() => recordEvent(g.id, { type: "game_started" }))}
            >
              START GAME
            </button>
          ) : null}

          {running ? (
            <div className="btn-row">
              <button
                type="button"
                onClick={() => tap(() => recordEvent(g.id, { type: "clock_paused" }))}
              >
                PAUSE
              </button>
              <button
                type="button"
                onClick={() =>
                  tap(() =>
                    recordEvent(g.id, {
                      type: "period_ended",
                      period: state.currentPeriod,
                    }),
                  )
                }
              >
                END {noun.toUpperCase()}
              </button>
            </div>
          ) : null}

          {state.phase === "paused" ? (
            <div className="btn-row">
              <button
                type="button"
                className="btn-primary"
                onClick={() => tap(() => recordEvent(g.id, { type: "clock_resumed" }))}
              >
                RESUME
              </button>
              <button
                type="button"
                onClick={() =>
                  tap(() =>
                    recordEvent(g.id, {
                      type: "period_ended",
                      period: state.currentPeriod,
                    }),
                  )
                }
              >
                END {noun.toUpperCase()}
              </button>
            </div>
          ) : null}

          {state.phase === "period_break" ? (
            state.currentPeriod < g.periodCount ? (
              <button
                type="button"
                className="btn-primary btn-block"
                onClick={() =>
                  tap(() =>
                    recordEvent(g.id, {
                      type: "period_started",
                      period: state.currentPeriod + 1,
                    }),
                  )
                }
              >
                START {noun.toUpperCase()} {state.currentPeriod + 1}
              </button>
            ) : (
              <p className="muted">
                All {g.periodCount} {noun.toLowerCase()}s are complete. End the game to
                close the log — or start another period if you are playing overtime.
              </p>
            )
          ) : null}

          {state.phase === "period_break" && state.currentPeriod >= g.periodCount ? (
            <button
              type="button"
              onClick={() =>
                tap(() =>
                  recordEvent(g.id, {
                    type: "period_started",
                    period: state.currentPeriod + 1,
                  }),
                )
              }
            >
              START OVERTIME
            </button>
          ) : null}

          {state.phase !== "scheduled" ? (
            <Confirm
              label="END GAME"
              question="End this game?"
              confirmLabel="End the game"
              onConfirm={() => {
                tap(() => recordEvent(g.id, { type: "game_ended" }));
                router.push(`/report/?id=${g.id}`);
              }}
            >
              The clock stops, everyone still on the field is checked out, and the log
              is closed. This cannot be undone.
            </Confirm>
          ) : null}
        </div>
      ) : null}

      <SyncStatus />
    </main>
  );
}

function PlayerTile({
  p,
  disabled,
  onTap,
}: {
  p: PlayerParticipation;
  disabled: boolean;
  onTap: () => void;
}) {
  const record = useStore(() => player(p.playerId));
  const label = record ? playerLabel(record) : "Unknown athlete";
  const jersey = record?.jerseyNumber.trim() ?? "";
  const name = record ? `${record.firstName} ${record.lastName}`.trim() : label;

  return (
    <button
      type="button"
      className={`player${p.onField ? " on" : ""}`}
      onClick={onTap}
      disabled={disabled}
      aria-pressed={p.onField}
      aria-label={`${label}. ${p.onField ? "On the field" : "On the bench"}. ${clockText(
        p.secondsPlayed,
      )} played, ${percentText(p.share)} of game time. Tap to ${p.onField ? "take off" : "send on"}.`}
    >
      <div className="head">
        <span className="jersey">{jersey === "" ? "—" : jersey}</span>
        <span className="state">{p.onField ? "On" : "Bench"}</span>
      </div>
      <span className="name">{name === "" ? label : name}</span>
      <div className="foot">
        <span className="time">{clockText(p.secondsPlayed)}</span>
        <span className="state">{percentText(p.share)}</span>
      </div>
      {p.status === "no_target" ? null : (
        <div style={{ marginTop: 6 }}>
          <StatusPill status={p.status} />
        </div>
      )}
    </button>
  );
}

/**
 * Ask the system to keep the screen on while a game is open.
 *
 * Best-effort and entirely cosmetic: nothing about the accuracy of this app
 * depends on the screen staying awake, because every duration is derived from
 * recorded instants. If the API is missing or the request is refused, the app
 * behaves identically — which is why this is allowed to fail silently.
 */
function useKeepAwake(): void {
  useEffect(() => {
    interface WakeLockSentinel {
      release: () => Promise<void>;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = () => {
      nav.wakeLock
        ?.request("screen")
        .then((s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        })
        .catch(() => {
          /* refused; the app works exactly the same */
        });
    };

    acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);
}

/**
 * useSearchParams is empty during prerender, so this screen renders its
 * loading state at build time and the real record once the device takes over.
 */
export default function LiveGamePage() {
  return (
    <Suspense
      fallback={
        <main>
          <TopBar back="/" />
          <Loading />
        </main>
      }
    >
      <GameScreen />
    </Suspense>
  );
}
