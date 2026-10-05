"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Result {
  name: string;
  ok: boolean;
  reason?: string;
  status?: string;
  dateSource?: "exif" | "upload";
}

const ACCEPT = /\.(jpe?g|png|heic|heif)$/i;
const PER_REQUEST = 3;
const PARALLEL = 3;

/**
 * Drag and drop, pick files, or pick a whole folder. Hundreds of photos are
 * sent a few at a time in parallel; each file's outcome is reported. The
 * originals are sent exactly as they are on disk.
 */
export function Uploader({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [over, setOver] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  async function upload(list: File[]) {
    const photos = list.filter((f) => ACCEPT.test(f.name));
    const skipped: Result[] = list
      .filter((f) => !ACCEPT.test(f.name) && !f.name.startsWith("."))
      .map((f) => ({
        name: f.name,
        ok: false,
        reason: "Not a JPG, PNG or HEIC photo.",
      }));
    if (photos.length === 0) {
      setResults(skipped);
      return;
    }
    setBusy(true);
    setSent(0);
    setTotal(photos.length);
    setResults(skipped);
    const batches: File[][] = [];
    for (let i = 0; i < photos.length; i += PER_REQUEST)
      batches.push(photos.slice(i, i + PER_REQUEST));
    let next = 0;
    const worker = async () => {
      for (;;) {
        const batch = batches[next++];
        if (batch === undefined) return;
        const body = new FormData();
        for (const f of batch) body.append("file", f, f.name);
        let out: Result[];
        try {
          const res = await fetch(`/api/events/${eventId}/photos`, {
            method: "POST",
            body,
          });
          const json = (await res.json()) as { results?: Result[]; error?: string };
          out =
            json.results ??
            batch.map((f) => ({
              name: f.name,
              ok: false,
              reason: json.error ?? "Upload failed.",
            }));
        } catch {
          out = batch.map((f) => ({
            name: f.name,
            ok: false,
            reason: "The connection dropped. Try these again.",
          }));
        }
        setResults((r) => [...r, ...out]);
        setSent((n) => n + batch.length);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setBusy(false);
    router.refresh();
  }

  const ok = results.filter((r) => r.ok);
  const dupes = results.filter(
    (r) => !r.ok && (r.reason ?? "").startsWith("Already uploaded"),
  );
  const refused = results.filter(
    (r) => !r.ok && !(r.reason ?? "").startsWith("Already uploaded"),
  );
  const inferred = ok.filter((r) => r.dateSource === "upload").length;

  return (
    <section className="card mb-5 p-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) void upload([...e.dataTransfer.files]);
        }}
        className={`grid place-items-center rounded-lg border-2 border-dashed p-6 text-center transition ${over ? "border-brand bg-brand/10" : "border-line"}`}
      >
        <p className="display text-lg">Drop photos here</p>
        <p className="mt-1 text-sm text-muted">
          JPG, PNG or HEIC · select hundreds at once · originals are never changed
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => files.current?.click()}
          >
            Choose photos
          </button>
          <button
            className="btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => folder.current?.click()}
          >
            Upload a folder
          </button>
        </div>
        <input
          ref={files}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic"
          className="hidden"
          aria-label="Choose photos"
          data-testid="file-input"
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={folder}
          type="file"
          multiple
          className="hidden"
          aria-label="Choose a folder"
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {total > 0 ? (
        <div className="mt-3 text-sm" aria-live="polite">
          <div className="h-2 overflow-hidden rounded bg-panel-2">
            <div
              className="h-full bg-brand-2 transition-all"
              style={{ width: `${Math.round((sent / total) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-muted">
            {busy ? `Uploading ${sent} / ${total}…` : `Upload finished.`} {ok.length}{" "}
            added
            {dupes.length > 0 ? ` · ${dupes.length} already here (skipped)` : ""}
            {refused.length > 0 ? ` · ${refused.length} refused` : ""}
            {inferred > 0
              ? ` · ${inferred} had no date in the file, so the upload date is used (marked "inferred")`
              : ""}
            .
          </p>
          {refused.length + dupes.length > 0 ? (
            <details className="mt-1 text-xs text-muted">
              <summary className="cursor-pointer">Show which files and why</summary>
              <ul className="mt-1 max-h-40 overflow-y-auto">
                {[...refused, ...dupes].map((r, i) => (
                  <li key={`${r.name}-${i}`}>
                    {r.name}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
