"use client";

import type { ProposedGame } from "@hl-bos/jersey-sort/folder-check";
import Link from "next/link";
import { useState } from "react";

import { createEventForImportAction } from "@/actions/events.ts";
import { longDateTime } from "@/lib/format.ts";
import { isDuplicate, uploadPhotos, type UploadResult } from "@/lib/upload-client.ts";

import { SPORTS } from "./EventForm.tsx";
import { TeamJerseys } from "./TeamJerseys.tsx";

export interface ExistingEvent {
  readonly id: string;
  readonly name: string;
  readonly event_date: string;
}

type Mode = "proposed" | "form" | "skipped" | "importing" | "done";

interface Done {
  readonly eventId: string;
  readonly eventName: string;
  readonly imported: number;
  readonly duplicates: number;
  readonly failed: readonly UploadResult[];
}

/**
 * One shooting date from Check a folder: what is in it, and what to do with
 * it. Nothing happens until the person presses a button. "Create event &
 * import" creates the event, then COPIES that date's photos into it through
 * the normal upload path; the files in the folder are only read.
 */
export function DateCard({
  game,
  photos,
  existing,
  defaultSport,
  onReview,
}: {
  game: ProposedGame;
  /** The supported photos taken that day, as the browser handed them over. */
  photos: readonly File[];
  /** Events already in JerseySort on this date. */
  existing: readonly ExistingEvent[];
  defaultSport: string;
  onReview: (day: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("proposed");
  const [name, setName] = useState(game.suggestedName);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [done, setDone] = useState<Done | null>(null);
  const [into, setInto] = useState(existing[0]?.id ?? "");

  async function importInto(eventId: string, eventName: string) {
    setMode("importing");
    setSent(0);
    const results = await uploadPhotos(eventId, photos, (_batch, n) => setSent(n));
    setDone({
      eventId,
      eventName,
      imported: results.filter((r) => r.ok).length,
      duplicates: results.filter(isDuplicate).length,
      failed: results.filter((r) => !r.ok && !isDuplicate(r)),
    });
    setMode("done");
  }

  async function create(form: HTMLFormElement) {
    setError(null);
    const fd = new FormData(form);
    fd.set("name", name);
    fd.set("date", game.day);
    const res = await createEventForImportAction(fd);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await importInto(res.id, res.name);
  }

  const id = game.day;
  return (
    <li className="card p-4" data-testid={`date-card-${id}`} data-mode={mode}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="display text-xl" data-testid="game">
          {game.label}
        </h4>
        {mode === "skipped" ? (
          <span className="chip bg-panel-2 text-muted">Skipped</span>
        ) : null}
      </div>

      {mode !== "skipped" ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <Count label="JPG / JPEG" value={game.jpeg} id="jpeg" />
          <Count label="HEIC" value={game.heic} id="heic" />
          <Count label="PNG" value={game.png} id="png" />
          <Count
            label="Canon RAW (CR2 / CR3)"
            value={game.raw}
            id="raw"
            note={game.raw > 0 ? `${game.cr2} CR2, ${game.cr3} CR3 · not imported` : ""}
          />
          <Count label="Camera date (EXIF)" value={game.camera} id="camera" />
          <Count label="Estimated date" value={game.estimated} id="estimated" warn />
          <div>
            <dt className="text-xs text-muted">First shot</dt>
            <dd data-testid="first">{longDateTime(game.first).split(" · ")[1]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last shot</dt>
            <dd data-testid="last">{longDateTime(game.last).split(" · ")[1]}</dd>
          </div>
        </dl>
      ) : null}

      {game.estimated > 0 && mode !== "skipped" && mode !== "done" ? (
        <p className="mt-2 text-xs text-medium" data-testid="estimated-warning">
          {game.estimated === 1
            ? "1 photo has no camera date and is placed on this day by the file's date."
            : `${game.estimated} photos have no camera date and are placed on this day by the file's date.`}{" "}
          Review them before importing if that might be wrong.
        </p>
      ) : null}

      {mode === "proposed" ? (
        <>
          <div className="mt-3 text-sm">
            <span className="text-muted">Event name: </span>
            {renaming ? (
              <input
                className="input mt-1 max-w-md"
                value={name}
                autoFocus
                aria-label={`Event name for ${game.day}`}
                data-testid="rename-input"
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setRenaming(false);
                }}
                onBlur={() => setRenaming(false)}
              />
            ) : (
              <span className="font-semibold" data-testid="event-name">
                {name}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              data-testid="create"
              onClick={() => setMode("form")}
            >
              Create event
            </button>
            <button
              type="button"
              className="btn-ghost"
              data-testid="rename"
              onClick={() => setRenaming(true)}
            >
              Rename event
            </button>
            <button
              type="button"
              className="btn-ghost"
              data-testid="skip"
              onClick={() => setMode("skipped")}
            >
              Skip
            </button>
            <button
              type="button"
              className="btn-ghost"
              data-testid="review"
              onClick={() => onReview(game.day)}
            >
              Review photos
            </button>
          </div>
          {existing.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">
                Or add them to an event already on this date:
              </span>
              <select
                className="input w-auto"
                value={into}
                onChange={(e) => setInto(e.currentTarget.value)}
                aria-label="Existing event"
              >
                {existing.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost"
                data-testid="import-existing"
                onClick={() =>
                  void importInto(into, existing.find((e) => e.id === into)?.name ?? "")
                }
              >
                Import into it
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {mode === "skipped" ? (
        <button
          type="button"
          className="btn-ghost mt-2"
          data-testid="unskip"
          onClick={() => setMode("proposed")}
        >
          Undo skip
        </button>
      ) : null}

      {mode === "form" ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          data-testid="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create(e.currentTarget);
          }}
        >
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`name-${id}`}>
              Event name
            </label>
            <input
              className="input"
              id={`name-${id}`}
              value={name}
              required
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Date: {game.label.split(" — ")[0]}
            </p>
          </div>
          <div>
            <label className="label" htmlFor={`sport-${id}`}>
              Sport
            </label>
            <select
              className="input"
              id={`sport-${id}`}
              name="sport"
              defaultValue={defaultSport}
            >
              {SPORTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`season-${id}`}>
              Season
            </label>
            <input
              className="input"
              id={`season-${id}`}
              name="season"
              placeholder={`${game.day.slice(0, 4)} (the event's year)`}
            />
          </div>
          <TeamJerseys homeJersey={null} awayJersey={null} idPrefix={`day-${id}-`} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`location-${id}`}>
              Location (optional)
            </label>
            <input className="input" id={`location-${id}`} name="location" />
          </div>
          {error !== null ? (
            <p className="text-sm text-low sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" data-testid="create-import">
              Create event &amp; import {photos.length.toLocaleString("en-US")} photo
              {photos.length === 1 ? "" : "s"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setMode("proposed")}
            >
              Cancel
            </button>
            <span className="text-xs text-muted">
              Copies the photos into JerseySort. The originals stay exactly where they
              are, unchanged.
            </span>
          </div>
        </form>
      ) : null}

      {mode === "importing" ? (
        <p className="mt-3 text-sm" aria-live="polite" data-testid="importing">
          Importing {sent.toLocaleString("en-US")} of{" "}
          {photos.length.toLocaleString("en-US")} photos…
        </p>
      ) : null}

      {mode === "done" && done !== null ? (
        <div className="mt-3 space-y-1 text-sm" data-testid="import-done">
          <p>
            <span className="font-semibold text-high" data-testid="imported">
              {done.imported.toLocaleString("en-US")} imported
            </span>{" "}
            into <span className="font-semibold">{done.eventName}</span>
            {done.duplicates > 0 ? (
              <span data-testid="duplicates">
                {" "}
                · {done.duplicates.toLocaleString("en-US")} already in JerseySort, not
                copied again
              </span>
            ) : null}
            {done.failed.length > 0 ? (
              <span className="text-low" data-testid="failed">
                {" "}
                · {done.failed.length} could not be imported
              </span>
            ) : null}
          </p>
          {done.failed.slice(0, 5).map((f) => (
            <p key={f.name} className="text-xs text-low">
              {f.name}: {f.reason}
            </p>
          ))}
          <p className="text-xs text-muted">
            The originals in the folder were only read, not changed. Jersey analysis has
            started.
          </p>
          <Link
            className="btn-ghost"
            href={`/events/${done.eventId}`}
            data-testid="open-event"
          >
            Open the event
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function Count({
  label,
  value,
  id,
  note,
  warn,
}: {
  label: string;
  value: number;
  id: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={warn && value > 0 ? "text-medium" : ""}
        data-testid={`count-${id}`}
      >
        {value.toLocaleString("en-US")}
        {note ? <span className="text-xs text-muted"> ({note})</span> : null}
      </dd>
    </div>
  );
}
