import Link from "next/link";

export function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <span
        className={`display block text-3xl sm:text-4xl ${accent ? "text-brand" : ""}`}
      >
        {value.toLocaleString("en-US")}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
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
