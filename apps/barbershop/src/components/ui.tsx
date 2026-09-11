export function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #21262d",
        borderRadius: 8,
        padding: "18px 20px",
        marginBottom: 18,
        background: "#0f141a",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
      {sub !== undefined && sub !== "" && (
        <p style={{ margin: "3px 0 14px", fontSize: 13, color: "#8b949e" }}>{sub}</p>
      )}
      {(sub === undefined || sub === "") && <div style={{ height: 14 }} />}
      {children}
    </section>
  );
}

/**
 * Says what is not there and why.
 *
 * Never used to hide a failure behind a friendly shrug: an empty state that
 * does not explain itself reads as "nothing to do here", which is usually not
 * what is true.
 */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 14, color: "#8b949e" }}>{children}</p>;
}

export function Badge({ status }: { status: string }) {
  const tone =
    status === "published"
      ? { bg: "#0f2e1a", fg: "#3fb950", label: "On the internet" }
      : status === "unpublished"
        ? { bg: "#2b1d0e", fg: "#d29922", label: "Taken down" }
        : { bg: "#161b22", fg: "#8b949e", label: "Draft — not live" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {tone.label}
    </span>
  );
}

export const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid #2f3742",
  background: "#0d1117",
  color: "#e6edf3",
  fontSize: 14,
  fontFamily: "inherit",
};

export function button(enabled: boolean, tone = "#238636"): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 6,
    border: "1px solid #2f3742",
    background: enabled ? tone : "#161b22",
    color: enabled ? "#fff" : "#6e7681",
    fontSize: 14,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "default",
  };
}
