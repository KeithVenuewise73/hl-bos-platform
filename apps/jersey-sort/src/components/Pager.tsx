import Link from "next/link";

import { withParam } from "@/lib/format.ts";

export function Pager({
  basePath,
  page,
  pages,
  total,
}: {
  basePath: string;
  page: number;
  pages: number;
  total: number;
}) {
  if (pages <= 1)
    return <p className="mt-3 text-xs text-muted">{total.toLocaleString()} photos</p>;
  return (
    <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pages">
      {page > 1 ? (
        <Link
          className="btn-ghost"
          href={withParam(basePath, "page", String(page - 1))}
        >
          ← Previous
        </Link>
      ) : null}
      <span className="text-muted">
        Page {page} of {pages} · {total.toLocaleString()} photos
      </span>
      {page < pages ? (
        <Link
          className="btn-ghost"
          href={withParam(basePath, "page", String(page + 1))}
        >
          Next →
        </Link>
      ) : null}
    </nav>
  );
}
