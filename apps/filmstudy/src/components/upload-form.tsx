"use client";

import { useRef, useState } from "react";
import { browserSupabase } from "@/lib/browser";
import { confirmFilmUpload, registerFilm } from "@/app/actions";

type Phase = "idle" | "registering" | "uploading" | "confirming" | "done" | "failed";

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-m4v"];
const ACCEPTED_EXT = ["mp4", "mov", "m4v"];

/**
 * The film upload workflow.
 *
 * Three steps, in this order, because the order is the security property:
 *
 *   1. register_film   — the DATABASE checks the permission, validates the
 *                        container and size, and COMPUTES the object path.
 *   2. the browser uploads the bytes to exactly that path.
 *   3. confirm_film_upload — only now does the film become playable.
 *
 * The client never chooses where the file lands, so it cannot aim an upload at
 * another tenant's storage prefix. And a film that fails at step 2 stays in
 * `registered`, which the library reports honestly as "waiting for upload"
 * rather than showing a broken play button.
 *
 * The duration is read from the file in the browser, which is the only place it
 * is available without a media toolchain on the server. If the browser cannot
 * decode it, the duration is sent as null and the UI says "unknown" — it is not
 * estimated from the file size.
 */
export function UploadForm({
  teamId,
  games,
  seasons,
}: {
  teamId: string;
  games: readonly { id: string; label: string }[];
  seasons: readonly { id: string; label: string }[];
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [href, setHref] = useState<string | null>(null);
  const [kind, setKind] = useState("game");
  const formRef = useRef<HTMLFormElement>(null);

  const busy =
    phase === "registering" || phase === "uploading" || phase === "confirming";

  async function readDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const element = document.createElement("video");
      element.preload = "metadata";
      const objectUrl = URL.createObjectURL(file);
      const finish = (value: number | null) => {
        URL.revokeObjectURL(objectUrl);
        resolve(value);
      };
      element.onloadedmetadata = () =>
        finish(Number.isFinite(element.duration) ? element.duration : null);
      element.onerror = () => finish(null);
      element.src = objectUrl;
    });
  }

  async function submit(form: FormData) {
    setMessage(null);
    setHref(null);

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setPhase("failed");
      setMessage("Choose a video file first.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(extension)) {
      setPhase("failed");
      setMessage(`FilmStudy accepts MP4, MOV and M4V. That file is .${extension}.`);
      return;
    }
    const supabase = browserSupabase();
    if (supabase === null) {
      setPhase("failed");
      setMessage(
        "This app is not connected to a Supabase project, so there is nowhere to upload to.",
      );
      return;
    }

    setPhase("registering");
    const duration = await readDuration(file);

    form.set("team_id", teamId);
    form.set("filename", file.name);
    form.set(
      "mime",
      file.type || `video/${extension === "mov" ? "quicktime" : extension}`,
    );
    form.set("size_bytes", String(file.size));

    const registered = await registerFilm(form);
    if (
      !registered.ok ||
      !registered.filmId ||
      !registered.bucket ||
      !registered.objectPath
    ) {
      setPhase("failed");
      setMessage(registered.message);
      return;
    }

    setPhase("uploading");
    setProgress(0);
    const { error } = await supabase.storage
      .from(registered.bucket)
      .upload(registered.objectPath, file, {
        contentType: file.type || "video/mp4",
        upsert: false,
      });

    if (error) {
      setPhase("failed");
      // Said plainly: the record exists, the bytes did not arrive. The library
      // will show this film as "waiting for upload", which is the truth.
      setMessage(
        `The film record was created but the video did not upload: ${error.message}. ` +
          "It will show in the library as waiting for upload until the file is sent.",
      );
      return;
    }

    setProgress(100);
    setPhase("confirming");
    const confirmed = await confirmFilmUpload(registered.filmId, file.size, duration);
    if (!confirmed.ok) {
      setPhase("failed");
      setMessage(confirmed.message);
      return;
    }

    setPhase("done");
    setMessage(
      duration === null
        ? "Film uploaded. This browser could not read the video's length, so it shows as unknown until it is opened."
        : "Film uploaded and ready to tag.",
    );
    setHref(`/film/${registered.filmId}`);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={submit}>
      <label className="field">
        <span className="field-label">Video file</span>
        <input
          type="file"
          name="file"
          accept={ACCEPTED.join(",")}
          required
          disabled={busy}
        />
        <span className="tiny faint">MP4, MOV or M4V. Up to 16 GB.</span>
      </label>

      <label className="field">
        <span className="field-label">Title</span>
        <input
          type="text"
          name="title"
          required
          disabled={busy}
          placeholder="Week 3 vs Orchard Park"
        />
      </label>

      <div className="grid grid-3">
        <label className="field">
          <span className="field-label">Film type</span>
          <select
            name="film_kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
          >
            <option value="game">Game</option>
            <option value="practice">Practice</option>
            <option value="scrimmage">Scrimmage</option>
            <option value="individual_workout">Individual workout</option>
            <option value="opponent">Opponent film</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Game</span>
          <select name="game_id" disabled={busy}>
            <option value="">Not linked to a game</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Season</span>
          <select name="season_id" disabled={busy}>
            <option value="">No season</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Side of the ball</span>
          <select name="unit" disabled={busy}>
            <option value="">Both</option>
            <option value="offense">Offense</option>
            <option value="defense">Defense</option>
            <option value="special_teams">Special teams</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Recorded on</span>
          <input type="date" name="recorded_on" disabled={busy} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea
          name="notes"
          disabled={busy}
          placeholder="Anything the staff should know before watching."
        />
      </label>

      {kind === "opponent" ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          <strong>Opponent film is coaches-only.</strong> It cannot be opened to
          athletes or guardians — the database refuses it, not just this screen.
        </div>
      ) : (
        <label className="row" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            name="athlete_visible"
            style={{ width: "auto" }}
            disabled={busy}
          />
          <span className="small">
            Open this film to the whole squad. Leave it off to keep it coaches-only;
            clips you assign to an athlete reach them either way.
          </span>
        </label>
      )}

      <button className="btn primary" type="submit" disabled={busy}>
        {phase === "registering"
          ? "Registering…"
          : phase === "uploading"
            ? `Uploading… ${progress}%`
            : phase === "confirming"
              ? "Finishing…"
              : "Upload film"}
      </button>

      {message !== null ? (
        <div
          className={phase === "failed" ? "notice bad" : "notice accent"}
          style={{ marginTop: 14 }}
        >
          {message}
          {href !== null ? (
            <>
              {" "}
              <a href={href} style={{ color: "var(--accent)", fontWeight: 600 }}>
                Open the film room
              </a>
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
