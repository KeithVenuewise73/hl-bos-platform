import type { ReactNode } from "react";

export function Card({
  title,
  children,
  right,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4 shadow-sm">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {sub ? <p className="text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  "Out of service": "bg-red-100 text-bad",
  "Defect open": "bg-amber-100 text-warn",
  Available: "bg-green-100 text-ok",
  Inactive: "bg-slate-200 text-muted",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      data-status={status}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-slate-100"}`}
    >
      {status}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-line p-4 text-sm text-muted">
      {children}
    </p>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warn" | "bad" | undefined;
}) {
  const c =
    tone === "bad"
      ? "text-bad"
      : tone === "warn"
        ? "text-warn"
        : tone === "ok"
          ? "text-ok"
          : "";
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${c}`}>{value}</div>
    </div>
  );
}

export function daysUntil(date: unknown): number | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

export function Expiry({ date }: { date: unknown }) {
  const d = daysUntil(date);
  if (d === null) return <span className="text-muted">not recorded</span>;
  const tone =
    d < 0 ? "text-bad font-semibold" : d <= 30 ? "text-warn font-semibold" : "";
  const note = d < 0 ? `expired ${-d} days ago` : d <= 30 ? `expires in ${d} days` : "";
  return (
    <span className={tone}>
      {date as string}
      {note ? ` — ${note}` : ""}
    </span>
  );
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
