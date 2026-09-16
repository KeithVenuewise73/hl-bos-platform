"use client";

import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { PERIOD_NOUN, playerLabel, type MinimumTarget } from "@hl-bos/playtime-engine";
import { Empty, ErrorNote, Field, Loading, TopBar } from "@/components/ui";
import { useMounted, useQueryParam, useStore } from "@/lib/hooks";
import { createGame, players, team } from "@/lib/store";
import { StorageFullError } from "@/lib/storage";

/** Sensible starting points, so a coach can accept the defaults and go. */
const PRESETS: Readonly<Record<string, { periods: number; minutes: number }>> = {
  football: { periods: 4, minutes: 12 },
  basketball: { periods: 4, minutes: 8 },
  soccer: { periods: 2, minutes: 30 },
  hockey: { periods: 3, minutes: 15 },
  baseball: { periods: 6, minutes: 20 },
  other: { periods: 2, minutes: 25 },
};

const today = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function NewGameScreen() {
  const mounted = useMounted();
  const teamId = useQueryParam("team");

  if (!mounted) {
    return (
      <main>
        <TopBar back="/" />
        <Loading />
      </main>
    );
  }
  if (teamId === null) {
    return (
      <main>
        <TopBar back="/" />
        <Empty title="Pick a team first">
          Open a team and start the game from there.
        </Empty>
      </main>
    );
  }
  return <Setup teamId={teamId} />;
}

function Setup({ teamId }: { teamId: string }) {
  const router = useRouter();
  const t = useStore(() => team(teamId));
  const roster = useStore(() => players(teamId).filter((p) => p.active));

  const preset = PRESETS[t?.sport ?? "other"] ?? PRESETS["other"]!;
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState(today);
  const [periods, setPeriods] = useState(String(preset.periods));
  const [minutes, setMinutes] = useState(String(preset.minutes));
  const [minKind, setMinKind] = useState<MinimumTarget["kind"]>("none");
  const [minPercent, setMinPercent] = useState("25");
  const [minMinutes, setMinMinutes] = useState("12");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(roster.map((p) => p.id)),
  );
  const [error, setError] = useState<string | null>(null);

  if (t === undefined) {
    return (
      <main>
        <TopBar back="/" />
        <Empty title="That team is not on this device" />
      </main>
    );
  }

  if (roster.length === 0) {
    return (
      <main>
        <TopBar back={`/team/?id=${teamId}`} />
        <Empty title="No active players">
          Add at least one athlete to the roster before starting a game.
        </Empty>
      </main>
    );
  }

  const noun = PERIOD_NOUN[t.sport];
  const periodCount = Number(periods);
  const periodMinutes = Number(minutes);
  const regulation = periodCount * periodMinutes;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const minimum = (): MinimumTarget => {
    if (minKind === "percent") return { kind: "percent", percent: Number(minPercent) };
    if (minKind === "seconds")
      return { kind: "seconds", seconds: Number(minMinutes) * 60 };
    return { kind: "none" };
  };

  return (
    <main>
      <TopBar back={`/team/?id=${teamId}`} />
      <h1>New game</h1>
      <p className="lead">{t.name}</p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!Number.isFinite(periodCount) || periodCount < 1 || periodCount > 12) {
            setError(`Choose between 1 and 12 ${noun.toLowerCase()}s.`);
            return;
          }
          if (
            !Number.isFinite(periodMinutes) ||
            periodMinutes < 1 ||
            periodMinutes > 120
          ) {
            setError("Choose a period length between 1 and 120 minutes.");
            return;
          }
          if (selected.size === 0) {
            setError("Choose at least one athlete who is available for this game.");
            return;
          }
          if (
            minKind === "percent" &&
            (Number(minPercent) < 1 || Number(minPercent) > 100)
          ) {
            setError("A percentage target must be between 1 and 100.");
            return;
          }
          if (minKind === "seconds" && Number(minMinutes) <= 0) {
            setError("A minimum playing time must be more than zero.");
            return;
          }
          try {
            const g = createGame({
              teamId,
              opponent,
              gameDate,
              periodCount,
              periodSeconds: Math.round(periodMinutes * 60),
              minimum: minimum(),
              rosterPlayerIds: [...selected],
            });
            router.replace(`/game/?id=${g.id}`);
          } catch (err) {
            setError(
              err instanceof StorageFullError
                ? err.message
                : "The game was not created.",
            );
          }
        }}
      >
        <Field label="Opponent">
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="West Seneca"
            autoComplete="off"
          />
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={gameDate}
            onChange={(e) => setGameDate(e.target.value)}
            required
          />
        </Field>

        <div className="field-row" style={{ marginTop: 14 }}>
          <Field label={`${noun}s`}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
            />
          </Field>
          <Field label="Minutes each">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={120}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          {Number.isFinite(regulation) && regulation > 0
            ? `${regulation} minutes of regulation time.`
            : "Enter a number of periods and a period length."}
        </div>

        <h2>Minimum participation</h2>
        <p className="muted">
          Your own target, used to flag athletes who are falling short. PlayTime Tracker
          does not know your league&rsquo;s rules and makes no claim about them.
        </p>
        <Field label="Target">
          <select
            value={minKind}
            onChange={(e) => setMinKind(e.target.value as MinimumTarget["kind"])}
          >
            <option value="none">No target</option>
            <option value="percent">Percentage of game time</option>
            <option value="seconds">Minimum playing time</option>
          </select>
        </Field>
        {minKind === "percent" ? (
          <Field
            label="Percent"
            hint={
              Number.isFinite(regulation) && regulation > 0
                ? `About ${Math.round((regulation * Number(minPercent)) / 100)} minutes of a ${regulation}-minute game.`
                : undefined
            }
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={minPercent}
              onChange={(e) => setMinPercent(e.target.value)}
            />
          </Field>
        ) : null}
        {minKind === "seconds" ? (
          <Field label="Minutes">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={minMinutes}
              onChange={(e) => setMinMinutes(e.target.value)}
            />
          </Field>
        ) : null}

        <h2>Who is here today</h2>
        <p className="muted">
          {selected.size} of {roster.length} selected. An athlete who is absent should
          be unselected, so the report does not show them as having played zero minutes.
        </p>
        <div className="stack">
          {roster.map((p) => {
            const on = selected.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="card row tight"
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderColor: on ? "var(--accent)" : "var(--line)",
                  borderWidth: on ? 2 : 1,
                }}
                aria-pressed={on}
                onClick={() => toggle(p.id)}
              >
                <span className="grow">{playerLabel(p)}</span>
                <span className="muted">{on ? "Available" : "Not today"}</span>
              </button>
            );
          })}
        </div>

        <div className="sticky-actions">
          <button type="submit" className="btn-primary btn-block">
            Create game
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * useSearchParams is empty during prerender, so this screen renders its
 * loading state at build time and the real record once the device takes over.
 */
export default function NewGamePage() {
  return (
    <Suspense
      fallback={
        <main>
          <TopBar back="/" />
          <Loading />
        </main>
      }
    >
      <NewGameScreen />
    </Suspense>
  );
}
