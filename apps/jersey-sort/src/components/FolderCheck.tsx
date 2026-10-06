"use client";

import {
  cameraTime,
  type CheckedFile,
  classifyFile,
  type FolderReport,
  proposeGames,
  SNIFF_BYTES,
  summarizeFolder,
  wallClock,
} from "@hl-bos/jersey-sort/folder-check";
import exifr from "exifr";
import { useMemo, useRef, useState } from "react";

import { Stat } from "@/components/Stat.tsx";
import { bytes, count, longDate, longDateTime } from "@/lib/format.ts";

const PARALLEL = 6;
const PAGE = 100;

/**
 * Read one file without changing it: its first bytes (what it is) and its
 * EXIF (when it was taken). File.slice and exifr only read. Nothing here can
 * write, and nothing is sent anywhere: this component never calls the server.
 */
async function inspect(file: File): Promise<CheckedFile> {
  const path = file.webkitRelativePath || file.name;
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const c = classifyFile(path, file.size, head);
  if (c.category === "unsupported") {
    return {
      path,
      size: file.size,
      ...c,
      takenAt: null,
      dateSource: null,
      camera: null,
    };
  }
  let tags: Record<string, unknown> | undefined;
  try {
    tags = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
      iptc: false,
      xmp: false,
      icc: false,
      ifd1: false,
      interop: false,
      makerNote: false,
      userComment: false,
      reviveValues: true,
      translateValues: false,
      pick: ["DateTimeOriginal", "CreateDate", "DateTime", "Make", "Model"],
    })) as Record<string, unknown> | undefined;
  } catch {
    tags = undefined; // unreadable EXIF (or a RAW format exifr cannot open): estimate below
  }
  const shot = cameraTime(tags);
  const estimate = shot === null ? wallClock(new Date(file.lastModified)) : null;
  const make = typeof tags?.["Make"] === "string" ? tags["Make"].trim() : "";
  const model = typeof tags?.["Model"] === "string" ? tags["Model"].trim() : "";
  const camera =
    model === ""
      ? make || null
      : model.toLowerCase().startsWith(make.toLowerCase())
        ? model
        : `${make} ${model}`.trim();
  return {
    path,
    size: file.size,
    ...c,
    takenAt: shot ?? estimate,
    dateSource: shot !== null ? "camera" : estimate !== null ? "estimated" : null,
    camera,
  };
}

type View = "all" | "estimated" | "raw" | "unsupported";

export function FolderCheck() {
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<CheckedFile[] | null>(null);
  const [view, setView] = useState<View>("all");
  const [page, setPage] = useState(0);

  const report: FolderReport | null = useMemo(
    () => (files === null ? null : summarizeFolder(files)),
    [files],
  );
  const games = useMemo(() => (report === null ? [] : proposeGames(report)), [report]);

  async function check(list: File[]) {
    if (list.length === 0) return;
    const first = list[0]?.webkitRelativePath.split("/")[0];
    setFolder(first && first.length > 0 ? first : null);
    setBusy(true);
    setFiles(null);
    setDone(0);
    setTotal(list.length);
    setView("all");
    setPage(0);
    const out: CheckedFile[] = new Array<CheckedFile>(list.length);
    let next = 0;
    let finished = 0;
    const worker = async () => {
      for (;;) {
        const i = next++;
        const file = list[i];
        if (file === undefined) return;
        out[i] = await inspect(file);
        finished += 1;
        if (finished % 25 === 0) setDone(finished);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    setDone(finished);
    setFiles(out);
    setBusy(false);
  }

  const shown = useMemo(() => {
    if (files === null) return [];
    if (view === "estimated")
      return files.filter((f) => f.category === "photo" && f.dateSource !== "camera");
    if (view === "raw") return files.filter((f) => f.category === "raw");
    if (view === "unsupported")
      return files.filter((f) => f.category === "unsupported");
    return files;
  }, [files, view]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));

  return (
    <div className="space-y-6">
      <div
        className="card border-high/40 p-4 text-sm"
        role="note"
        data-testid="read-only-note"
      >
        <p className="font-semibold text-high">
          Read only. Nothing in the folder is changed.
        </p>
        <p className="mt-1 text-muted">
          Check Folder only reads your photos, on this computer. It does not upload,
          copy, move, rename, delete or re-date anything, and it writes nothing into the
          folder. Your browser may ask whether to &ldquo;upload&rdquo; the folder: that
          is the browser&apos;s standard wording for letting a page see files. Nothing
          is sent, and nothing is imported or created. Choosing games and importing come
          later, as a separate step.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {files === null ? "Choose a folder to check" : "Check another folder"}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          data-testid="check-folder-input"
          aria-label="Choose a folder to check"
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            const list = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            void check(list);
          }}
        />
        {busy ? (
          <span
            className="text-sm text-muted"
            aria-live="polite"
            data-testid="check-progress"
          >
            Reading {done.toLocaleString("en-US")} of {total.toLocaleString("en-US")}{" "}
            files…
          </span>
        ) : null}
      </div>

      {report !== null && files !== null ? (
        <div className="space-y-6" data-testid="check-report">
          <h2 className="display text-xl">
            {folder ?? "Folder"}{" "}
            <span className="text-sm font-normal normal-case text-muted">
              · checked {count(report.totalFiles, "file")}, nothing changed
            </span>
          </h2>

          <section
            aria-label="What is in the folder"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            <Stat testId="stat-total" label="Total files" value={report.totalFiles} />
            <Stat
              testId="stat-supported"
              label="Supported photos"
              value={report.supported}
              accent
            />
            <Stat testId="stat-jpeg" label="JPG / JPEG" value={report.jpeg} />
            <Stat
              testId="stat-png-heic"
              label="PNG / HEIC"
              value={report.png + report.heic}
              note={`${report.png} PNG · ${report.heic} HEIC`}
            />
            <Stat testId="stat-cr2" label="Canon RAW .CR2" value={report.cr2} />
            <Stat testId="stat-cr3" label="Canon RAW .CR3" value={report.cr3} />
            <Stat
              testId="stat-unsupported"
              label="Not supported"
              value={report.unsupported.length}
            />
            <Stat
              testId="stat-estimated"
              label="Photos with estimated date"
              value={report.estimatedDated}
              note={`${report.cameraDated.toLocaleString("en-US")} have a camera date`}
              warn={report.estimatedDated > 0}
            />
          </section>

          {report.cr2 + report.cr3 > 0 ? (
            <p className="card p-3 text-sm text-medium" data-testid="raw-note">
              {count(report.cr2 + report.cr3, "Canon RAW file")} found. JerseySort
              cannot import RAW files yet; they are counted here so you know they are
              there. If you shoot RAW + JPEG, the JPEGs are what will be imported.
            </p>
          ) : null}

          <section className="card p-4" aria-label="When the photos were taken">
            <h3 className="label">When the photos were taken</h3>
            {report.earliest === null ? (
              <p className="text-sm text-muted">No photo in this folder has a date.</p>
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Earliest</dt>
                  <dd data-testid="earliest">{longDateTime(report.earliest)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Latest</dt>
                  <dd data-testid="latest">
                    {longDateTime(report.latest ?? report.earliest)}
                  </dd>
                </div>
              </dl>
            )}
            {report.rangeIncludesEstimate ? (
              <p className="mt-2 text-xs text-medium">
                The earliest or latest time is an estimate from the file&apos;s date,
                not the camera&apos;s.
              </p>
            ) : null}
          </section>

          <section className="card overflow-x-auto p-4" aria-label="Shooting dates">
            <h3 className="label">
              Shooting dates ({report.days.length.toLocaleString("en-US")})
            </h3>
            <table className="w-full text-left text-sm" data-testid="days">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3 text-right">Photos</th>
                  <th className="py-1 pr-3 text-right">Estimated date</th>
                  <th className="py-1 pr-3 text-right">Canon RAW</th>
                  <th className="py-1">First – last shot</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((d) => (
                  <tr key={d.day} className="border-t border-line" data-day={d.day}>
                    <td className="py-1.5 pr-3 font-semibold">{longDate(d.day)}</td>
                    <td className="py-1.5 pr-3 text-right" data-col="photos">
                      {d.photos.toLocaleString("en-US")}
                    </td>
                    <td
                      className={`py-1.5 pr-3 text-right ${d.estimated > 0 ? "text-medium" : "text-muted"}`}
                      data-col="estimated"
                    >
                      {d.estimated.toLocaleString("en-US")}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted" data-col="raw">
                      {d.raw.toLocaleString("en-US")}
                    </td>
                    <td className="py-1.5 text-muted">
                      {d.first.slice(11, 16)} – {d.last.slice(11, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4" aria-label="Proposed games">
            <h3 className="label">Proposed games</h3>
            {games.length === 0 ? (
              <p className="text-sm text-muted">
                No supported photos, so no games to propose.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm" data-testid="games">
                  {games.map((g) => (
                    <li key={g.day} className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold" data-testid="game">
                        {g.label}
                      </span>
                      {g.estimated > 0 ? (
                        <span className="chip bg-medium/15 text-medium">
                          {g.estimated.toLocaleString("en-US")} by estimated date
                        </span>
                      ) : null}
                      {g.raw > 0 ? (
                        <span className="chip bg-panel-2 text-muted">
                          + {g.raw.toLocaleString("en-US")} RAW
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted" data-testid="games-not-created">
                  A proposal, one game per shooting date. No games have been created and
                  nothing has been imported.
                </p>
              </>
            )}
          </section>

          <section className="card overflow-x-auto p-4" aria-label="Every file">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="label mb-0 mr-2">Every file</h3>
              {(
                [
                  ["all", `All (${files.length})`],
                  [
                    "estimated",
                    `Estimated or no date (${files.filter((f) => f.category === "photo" && f.dateSource !== "camera").length})`,
                  ],
                  ["raw", `Canon RAW (${report.cr2 + report.cr3})`],
                  ["unsupported", `Not supported (${report.unsupported.length})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  className={`chip px-2 py-1 ${view === v ? "bg-brand text-white" : "bg-panel-2 text-muted"}`}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                    setPage(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <table className="w-full text-left text-xs" data-testid="files">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3">File</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3 text-right">Size</th>
                  <th className="py-1 pr-3">Taken</th>
                  <th className="py-1 pr-3">Date from</th>
                  <th className="py-1">Camera</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(page * PAGE, page * PAGE + PAGE).map((f) => (
                  <tr key={f.path} className="border-t border-line" data-file={f.path}>
                    <td className="max-w-xs truncate py-1 pr-3" title={f.path}>
                      {f.path}
                    </td>
                    <td className="py-1 pr-3">
                      {f.category === "unsupported" ? (
                        <span className="text-low">{f.reason}</span>
                      ) : (
                        (f.format ?? "").toUpperCase().replace("JPEG", "JPG")
                      )}
                    </td>
                    <td className="py-1 pr-3 text-right text-muted">{bytes(f.size)}</td>
                    <td className="py-1 pr-3">
                      {f.takenAt === null ? "—" : longDateTime(f.takenAt)}
                    </td>
                    <td className="py-1 pr-3" data-col="source">
                      {f.dateSource === "camera" ? (
                        <span className="text-high">Camera (EXIF)</span>
                      ) : f.dateSource === "estimated" ? (
                        <span className="text-medium">Estimated from file date</span>
                      ) : f.category === "unsupported" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="text-low">No date</span>
                      )}
                    </td>
                    <td className="py-1 text-muted">{f.camera ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pages > 1 ? (
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  type="button"
                  className="btn-ghost px-2 py-1"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span className="text-muted">
                  Page {page + 1} of {pages}
                </span>
                <button
                  type="button"
                  className="btn-ghost px-2 py-1"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
