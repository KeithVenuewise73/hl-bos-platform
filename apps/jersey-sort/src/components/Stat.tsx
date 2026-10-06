import Link from "next/link";

export function Stat({
  label,
  value,
  href,
  accent,
  warn,
  note,
  testId,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
  /** Draws the number in the caution colour. */
  warn?: boolean;
  /** A line of detail under the label. */
  note?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span
        className={`display block text-3xl sm:text-4xl ${accent ? "text-brand" : warn ? "text-medium" : ""}`}
        data-testid={testId}
      >
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {note ? <span className="mt-1 block text-[11px] text-muted">{note}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 hover:border-muted">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}
