import Link from "next/link";

export function Tabs({
  tabs,
  active,
}: {
  tabs: ReadonlyArray<{ key: string; label: string; href: string; count?: number }>;
  active: string;
}) {
  return (
    <nav
      className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      aria-label="Sections"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${t.key === active ? "border-brand text-text" : "border-transparent text-muted hover:text-text"}`}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="ml-1.5 text-xs text-muted">
              {t.count.toLocaleString()}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
