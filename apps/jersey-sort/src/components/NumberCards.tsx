import Link from "next/link";

import { compareJerseyNumbers } from "@hl-bos/jersey-sort";

import type { NumberGroup } from "@/lib/repo/events.ts";

/** "#24 — Dominic Herman · 42 photos", one card per jersey gallery, plus Unidentified. */
export function NumberCards({
  groups,
  hrefFor,
  unidentified,
  unidentifiedHref,
}: {
  groups: readonly NumberGroup[];
  hrefFor: (value: string) => string;
  unidentified: number;
  unidentifiedHref: string;
}) {
  const sorted = [...groups].sort((a, b) => compareJerseyNumbers(a.value, b.value));
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {sorted.map((g) => (
        <li key={g.value}>
          <Link href={hrefFor(g.value)} className="card block p-3 hover:border-muted">
            <span className="display block text-3xl text-brand">#{g.value}</span>
            {g.player_name ? (
              <span className="block truncate text-sm font-semibold">
                {g.player_name}
              </span>
            ) : null}
            <span className="block text-xs text-muted">
              {g.photo_count.toLocaleString()} photo{g.photo_count === 1 ? "" : "s"}
              {g.needs_review > 0 ? ` · ${g.needs_review} to review` : ""}
            </span>
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={unidentifiedHref}
          className="card block border-dashed p-3 hover:border-muted"
        >
          <span className="display block text-2xl text-muted">Unidentified</span>
          <span className="block text-xs text-muted">
            {unidentified.toLocaleString()} photo{unidentified === 1 ? "" : "s"}
          </span>
        </Link>
      </li>
    </ul>
  );
}
