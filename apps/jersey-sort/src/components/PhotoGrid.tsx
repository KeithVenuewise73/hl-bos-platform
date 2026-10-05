"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { bulkAction, type BulkOp } from "@/actions/bulk.ts";

export interface GridDetection {
  readonly value: string;
  readonly band: "high" | "medium" | "low" | "confirmed";
}

export interface GridTile {
  readonly id: string;
  readonly filename: string;
  readonly status: string;
  readonly favorite: boolean;
  readonly unusable: boolean;
  readonly noJersey: boolean;
  readonly hasThumbnail: boolean;
  readonly detections: readonly GridDetection[];
  /** "#24 — Dominic Herman" labels, when known. */
  readonly names: Readonly<Record<string, string>>;
}

export interface Option {
  readonly id: string;
  readonly label: string;
}

const BAND_CLASS: Record<GridDetection["band"], string> = {
  confirmed: "bg-high text-black",
  high: "bg-high/85 text-black",
  medium: "bg-medium text-black",
  low: "bg-low/80 text-white",
};

const STATUS_BADGE: Record<string, string> = {
  queued: "Queued",
  uploaded: "Queued",
  processing: "Analyzing…",
  needs_review: "Review",
  failed: "Failed",
};

export function PhotoGrid({
  tiles,
  players,
  albums,
  emptyText,
}: {
  tiles: readonly GridTile[];
  players: readonly Option[];
  albums: readonly Option[];
  emptyText: string;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [numberValue, setNumberValue] = useState("");
  const [playerValue, setPlayerValue] = useState("");
  const [albumValue, setAlbumValue] = useState("");

  if (tiles.length === 0) {
    return <p className="card p-6 text-sm text-muted">{emptyText}</p>;
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = (op: BulkOp, value = "") => {
    startTransition(async () => {
      const result = await bulkAction(op, [...selected], value);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  };

  const ids = [...selected];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className={selecting ? "btn-primary" : "btn-ghost"}
          type="button"
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
            setMessage(null);
          }}
        >
          {selecting ? "Done selecting" : "Select photos"}
        </button>
        {selecting ? (
          <>
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setSelected(new Set(tiles.map((t) => t.id)))}
            >
              Select all {tiles.length}
            </button>
            <span className="text-sm text-muted">{selected.size} selected</span>
          </>
        ) : null}
      </div>

      {selecting && selected.size > 0 ? (
        <div
          className="card sticky top-[104px] z-20 mb-3 flex flex-wrap items-end gap-2 p-3"
          aria-label="Bulk actions"
        >
          <div className="flex items-end gap-1">
            <div>
              <label className="label" htmlFor="bulk-number">
                Jersey #
              </label>
              <input
                id="bulk-number"
                className="input w-20"
                inputMode="numeric"
                maxLength={3}
                value={numberValue}
                onChange={(e) => setNumberValue(e.target.value)}
              />
            </div>
            <button
              className="btn-ghost"
              disabled={pending || numberValue === ""}
              type="button"
              onClick={() => run("add_number", numberValue)}
            >
              Add
            </button>
            <button
              className="btn-ghost"
              disabled={pending || numberValue === ""}
              type="button"
              onClick={() => run("remove_number", numberValue)}
            >
              Remove tag
            </button>
          </div>
          {players.length > 0 ? (
            <div className="flex items-end gap-1">
              <div>
                <label className="label" htmlFor="bulk-player">
                  Player
                </label>
                <select
                  id="bulk-player"
                  className="input"
                  value={playerValue}
                  onChange={(e) => setPlayerValue(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn-ghost"
                disabled={pending || playerValue === ""}
                type="button"
                onClick={() => run("assign_player", playerValue)}
              >
                Assign
              </button>
              <button
                className="btn-ghost"
                disabled={pending || playerValue === ""}
                type="button"
                onClick={() => run("unassign_player", playerValue)}
              >
                Untag
              </button>
            </div>
          ) : null}
          {albums.length > 0 ? (
            <div className="flex items-end gap-1">
              <div>
                <label className="label" htmlFor="bulk-album">
                  Album
                </label>
                <select
                  id="bulk-album"
                  className="input"
                  value={albumValue}
                  onChange={(e) => setAlbumValue(e.target.value)}
                >
                  <option value="">Choose…</option>
                  {albums.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn-ghost"
                disabled={pending || albumValue === ""}
                type="button"
                onClick={() => run("add_to_album", albumValue)}
              >
                Add to album
              </button>
            </div>
          ) : null}
          <button
            className="btn-ghost"
            disabled={pending}
            type="button"
            onClick={() => run("favorite")}
          >
            ★ Favorite
          </button>
          <button
            className="btn-ghost"
            disabled={pending}
            type="button"
            onClick={() => run("unfavorite")}
          >
            ☆ Unfavorite
          </button>
          <button
            className="btn-ghost"
            disabled={pending}
            type="button"
            onClick={() => run("mark_reviewed")}
          >
            Mark reviewed
          </button>
          <form method="post" action="/api/download">
            {ids.map((id) => (
              <input key={id} type="hidden" name="id" value={id} />
            ))}
            <button className="btn-primary" type="submit">
              Download {selected.size}
            </button>
          </form>
        </div>
      ) : null}

      {message !== null ? (
        <p
          role="status"
          className={`mb-3 text-sm ${message.ok ? "text-green-300" : "text-red-300"}`}
        >
          {message.text}
        </p>
      ) : null}

      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {tiles.map((t) => {
          const isSelected = selected.has(t.id);
          const body = (
            <>
              {t.hasThumbnail ? (
                <img
                  src={`/api/photos/${t.id}/thumb`}
                  alt={t.filename}
                  loading="lazy"
                  decoding="async"
                  className={`h-full w-full object-cover ${t.unusable ? "opacity-40 grayscale" : ""}`}
                />
              ) : (
                <span className="grid h-full w-full place-items-center p-2 text-center text-[10px] text-muted">
                  {t.filename}
                  <br />
                  No preview
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-1">
                {t.detections.slice(0, 4).map((d) => (
                  <span
                    key={d.value}
                    className={`chip ${BAND_CLASS[d.band]}`}
                    title={t.names[d.value] ?? `#${d.value}`}
                  >
                    #{d.value}
                  </span>
                ))}
                {t.noJersey ? (
                  <span className="chip bg-panel-2 text-muted">no #</span>
                ) : null}
              </span>
              {t.favorite ? (
                <span
                  className="absolute right-1 top-1 text-brand-2 drop-shadow"
                  aria-label="Favorite"
                >
                  ★
                </span>
              ) : null}
              {STATUS_BADGE[t.status] !== undefined ? (
                <span
                  className={`chip absolute left-1 top-1 ${t.status === "failed" ? "bg-low text-white" : t.status === "needs_review" ? "bg-medium text-black" : "bg-panel-2 text-text"}`}
                >
                  {STATUS_BADGE[t.status]}
                </span>
              ) : null}
              {t.unusable ? (
                <span className="chip absolute bottom-6 left-1 bg-panel-2 text-muted">
                  Unusable
                </span>
              ) : null}
              {selecting ? (
                <span
                  className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded border-2 text-xs ${isSelected ? "border-brand bg-brand text-white" : "border-white/70 bg-black/40"}`}
                >
                  {isSelected ? "✓" : ""}
                </span>
              ) : null}
            </>
          );
          return (
            <li
              key={t.id}
              className={`relative aspect-square overflow-hidden rounded-md bg-panel-2 ${isSelected ? "ring-2 ring-brand" : ""}`}
            >
              {selecting ? (
                <button
                  type="button"
                  className="block h-full w-full"
                  aria-pressed={isSelected}
                  aria-label={`Select ${t.filename}`}
                  onClick={() => toggle(t.id)}
                >
                  {body}
                </button>
              ) : (
                <Link
                  href={`/photos/${t.id}`}
                  className="block h-full w-full"
                  aria-label={t.filename}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
