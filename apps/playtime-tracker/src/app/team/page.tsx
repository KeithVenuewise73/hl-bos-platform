"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SPORTS, SPORT_LABEL, playerLabel, type Sport } from "@hl-bos/playtime-engine";
import { Confirm } from "@/components/Confirm";
import { Empty, ErrorNote, Field, Loading, TopBar } from "@/components/ui";
import { useMounted, useQueryParam, useStore } from "@/lib/hooks";
import {
  archiveTeam,
  canDeletePlayer,
  createPlayer,
  createTeam,
  deletePlayer,
  deleteTeam,
  games,
  player,
  players,
  team,
  updatePlayer,
  updateTeam,
} from "@/lib/store";
import { StorageFullError } from "@/lib/storage";

/** One screen for creating a team, editing it, and managing its roster. */
function TeamScreen() {
  const mounted = useMounted();
  const id = useQueryParam("id");
  const router = useRouter();

  if (!mounted) {
    return (
      <main>
        <TopBar back="/" />
        <Loading />
      </main>
    );
  }
  return id === null ? <NewTeam onCreated={(t) => router.replace(`/team/?id=${t}`)} /> : <EditTeam id={id} />;
}

function NewTeam({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [sport, setSport] = useState<Sport>("football");
  const [error, setError] = useState<string | null>(null);

  return (
    <main>
      <TopBar back="/" />
      <h1>New team</h1>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length === 0) {
            setError("Give the team a name.");
            return;
          }
          try {
            onCreated(createTeam(name, sport).id);
          } catch (err) {
            setError(err instanceof StorageFullError ? err.message : "The team could not be saved.");
          }
        }}
      >
        <Field label="Team name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Orchard Park U12"
            autoFocus
            required
          />
        </Field>
        <Field label="Sport" hint="This only changes wording — quarters, halves, periods or innings.">
          <select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn-primary btn-block" style={{ marginTop: 20 }}>
          Create team
        </button>
      </form>
    </main>
  );
}

function EditTeam({ id }: { id: string }) {
  const router = useRouter();
  const t = useStore(() => team(id));
  const roster = useStore(() => players(id));
  const teamGames = useStore(() => games().filter((g) => g.teamId === id));
  const [error, setError] = useState<string | null>(null);

  if (t === undefined) {
    return (
      <main>
        <TopBar back="/" />
        <Empty title="That team is not on this device">
          It may have been deleted, or created under a different account.
        </Empty>
      </main>
    );
  }

  const active = roster.filter((p) => p.active);
  const inactive = roster.filter((p) => !p.active);

  return (
    <main>
      <TopBar back="/" />
      <h1>{t.name}</h1>
      <p className="lead">
        {SPORT_LABEL[t.sport]} · {active.length} active player{active.length === 1 ? "" : "s"}
      </p>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {active.length > 0 ? (
        <Link className="btn btn-primary btn-block" href={`/game/new/?team=${t.id}`}>
          Start a new game
        </Link>
      ) : null}

      <h2>Roster</h2>
      <AddPlayer teamId={t.id} onError={setError} />

      {active.length === 0 && inactive.length === 0 ? (
        <Empty title="No players yet">
          Add at least one athlete before starting a game. Only a jersey number is required.
        </Empty>
      ) : (
        <div className="stack">
          {active.map((p) => (
            <PlayerRow key={p.id} id={p.id} onError={setError} />
          ))}
        </div>
      )}

      {inactive.length > 0 ? (
        <>
          <h2>Not on the roster</h2>
          <p className="muted">
            These athletes keep every minute already recorded. Past reports do not change.
          </p>
          <div className="stack">
            {inactive.map((p) => (
              <PlayerRow key={p.id} id={p.id} onError={setError} />
            ))}
          </div>
        </>
      ) : null}

      <h2>Team settings</h2>
      <TeamSettings id={t.id} name={t.name} sport={t.sport} onError={setError} />

      <div className="stack" style={{ marginTop: 20 }}>
        {t.archivedAt === null ? (
          <Confirm
            className="btn-block"
            label="Archive this team"
            question={`Archive ${t.name}?`}
            confirmLabel="Archive"
            onConfirm={() => {
              archiveTeam(t.id);
              router.push("/");
            }}
          >
            It leaves your team list. Every game and report is kept, and you can restore it later.
          </Confirm>
        ) : null}

        <Confirm
          label="Delete this team permanently"
          question={`Permanently delete ${t.name}?`}
          confirmLabel="Delete everything"
          onConfirm={() => {
            deleteTeam(t.id);
            router.push("/");
          }}
        >
          This removes the roster and all {teamGames.length} game
          {teamGames.length === 1 ? "" : "s"}, including every playing-time record. It cannot be
          undone.
        </Confirm>
      </div>
    </main>
  );
}

function TeamSettings({
  id,
  name,
  sport,
  onError,
}: {
  id: string;
  name: string;
  sport: Sport;
  onError: (m: string | null) => void;
}) {
  const [draftName, setDraftName] = useState(name);
  const [draftSport, setDraftSport] = useState<Sport>(sport);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraftName(name);
    setDraftSport(sport);
  }, [name, sport]);

  const dirty = draftName.trim() !== name || draftSport !== sport;

  return (
    <div className="card">
      <Field label="Team name">
        <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
      </Field>
      <Field label="Sport">
        <select value={draftSport} onChange={(e) => setDraftSport(e.target.value as Sport)}>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {SPORT_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        className="btn-block"
        style={{ marginTop: 14 }}
        disabled={!dirty || draftName.trim().length === 0}
        onClick={() => {
          try {
            updateTeam(id, { name: draftName, sport: draftSport });
            onError(null);
            setSaved(true);
          } catch (err) {
            onError(err instanceof StorageFullError ? err.message : "The change was not saved.");
          }
        }}
      >
        {dirty ? "Save changes" : saved ? "Saved" : "No changes"}
      </button>
    </div>
  );
}

function AddPlayer({ teamId, onError }: { teamId: string; onError: (m: string | null) => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!first.trim() && !last.trim() && !jersey.trim()) {
          onError("Give the athlete at least a name or a jersey number.");
          return;
        }
        try {
          createPlayer(teamId, {
            firstName: first,
            lastName: last,
            jerseyNumber: jersey,
            position,
          });
          onError(null);
          setFirst("");
          setLast("");
          setJersey("");
          setPosition("");
        } catch (err) {
          onError(err instanceof StorageFullError ? err.message : "The player was not saved.");
        }
      }}
    >
      <div className="field-row">
        <Field label="First name">
          <input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Last name">
          <input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <div className="field-row" style={{ marginTop: 14 }}>
        <Field label="Jersey">
          {/* Text, not a number input: "00" and "07" are real jerseys. */}
          <input
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
          />
        </Field>
        <Field label="Position">
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </Field>
      </div>
      <button type="submit" className="btn-block" style={{ marginTop: 14 }}>
        Add player
      </button>
    </form>
  );
}

function PlayerRow({ id, onError }: { id: string; onError: (m: string | null) => void }) {
  const p = useStore(() => player(id));
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");

  // Re-seed the form whenever the underlying record changes, so an edit made
  // on another screen (or arriving from sync) is not silently overwritten by a
  // stale draft.
  useEffect(() => {
    if (p === undefined) return;
    setFirst(p.firstName);
    setLast(p.lastName);
    setJersey(p.jerseyNumber);
    setPosition(p.position ?? "");
  }, [p?.id, p?.updatedAt, p?.firstName, p?.lastName, p?.jerseyNumber, p?.position]);

  if (p === undefined) return null;

  if (!editing) {
    return (
      <div className="card row tight">
        <div className="grow">
          <strong>{playerLabel(p)}</strong>
          <div className="muted">{p.position ?? "No position set"}</div>
        </div>
        <button type="button" className="btn-small" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="field-row">
        <Field label="First name">
          <input value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
        <Field label="Last name">
          <input value={last} onChange={(e) => setLast(e.target.value)} />
        </Field>
      </div>
      <div className="field-row" style={{ marginTop: 14 }}>
        <Field label="Jersey">
          <input
            value={jersey}
            onChange={(e) => setJersey(e.target.value)}
            inputMode="numeric"
            maxLength={4}
          />
        </Field>
        <Field label="Position">
          <input value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
      </div>

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            try {
              updatePlayer(p.id, {
                firstName: first,
                lastName: last,
                jerseyNumber: jersey,
                position,
              });
              onError(null);
              setEditing(false);
            } catch (err) {
              onError(err instanceof StorageFullError ? err.message : "The change was not saved.");
            }
          }}
        >
          Save
        </button>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn-block"
          onClick={() => {
            updatePlayer(p.id, { active: !p.active });
            setEditing(false);
          }}
        >
          {p.active ? "Take off the roster" : "Put back on the roster"}
        </button>

        {canDeletePlayer(p.id) ? (
          <Confirm
            label="Delete permanently"
            question={`Delete ${playerLabel(p)}?`}
            confirmLabel="Delete"
            onConfirm={() => {
              deletePlayer(p.id);
              setEditing(false);
            }}
          >
            This athlete has never appeared in a game, so nothing is lost.
          </Confirm>
        ) : (
          <div className="muted">
            This athlete has playing time recorded, so they cannot be deleted — taking them off the
            roster is what keeps past reports accurate.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * useSearchParams is empty during prerender, so this screen renders its
 * loading state at build time and the real record once the device takes over.
 */
export default function TeamPage() {
  return (
    <Suspense
      fallback={
        <main>
          <TopBar back="/" />
          <Loading />
        </main>
      }
    >
      <TeamScreen />
    </Suspense>
  );
}
