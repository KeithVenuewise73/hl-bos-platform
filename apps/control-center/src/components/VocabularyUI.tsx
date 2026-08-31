import type { VocabularyGroup, VocabularyOption } from "@/lib/vocabulary";
import { TIER_LABEL } from "@/lib/vocabulary";

const TIER_COLOR: Readonly<Record<number, { fg: string; bg: string }>> = {
  0: { fg: "#8b949e", bg: "#1c2128" },
  1: { fg: "#d29922", bg: "#221a06" },
  2: { fg: "#f85149", bg: "#2a1214" },
};

function Tag({ text, fg, bg }: { text: string; fg: string; bg: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        color: fg,
        background: bg,
        border: `1px solid ${fg}33`,
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/**
 * One choice: what a customer reads, and what we send an image model.
 *
 * The phrase is the column that matters and the column nobody could see
 * before, so it is given the width and the monospace treatment — it is text we
 * transmit verbatim, and it should look like it.
 *
 * A choice that adds nothing says so in words. A blank cell reads as an
 * oversight, and an oversight is exactly what a reviewer would then go looking
 * for in code.
 */
function OptionRow({
  option,
  isDefault,
  tiered,
}: {
  option: VocabularyOption;
  isDefault: boolean;
  tiered: boolean;
}) {
  const tier = option.tier ?? 0;
  const colour = TIER_COLOR[tier] ?? TIER_COLOR[0]!;
  return (
    <tr>
      <td
        style={{
          padding: "8px 12px 8px 0",
          borderBottom: "1px solid #1c2128",
          fontSize: 13,
          verticalAlign: "top",
          width: "30%",
        }}
      >
        <span>{option.label}</span>
        {isDefault ? (
          <span style={{ color: "#6e7681", fontSize: 11.5 }}> · default</span>
        ) : null}
        {tiered ? (
          <div style={{ marginTop: 5 }}>
            <Tag text={TIER_LABEL[tier] ?? "—"} fg={colour.fg} bg={colour.bg} />
          </div>
        ) : null}
      </td>
      <td
        style={{
          padding: "8px 0",
          borderBottom: "1px solid #1c2128",
          fontSize: 12.5,
          verticalAlign: "top",
          color: option.phrase ? "#c9d1d9" : "#6e7681",
          fontFamily: option.phrase
            ? "ui-monospace, SFMono-Regular, Menlo, monospace"
            : "inherit",
          fontStyle: option.phrase ? "normal" : "italic",
          lineHeight: 1.5,
        }}
      >
        {option.phrase || "adds nothing to the description"}
      </td>
    </tr>
  );
}

export function GroupTable({ group }: { group: VocabularyGroup }) {
  const tiered = group.options.some((o) => o.tier !== undefined);
  return (
    <div style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 3,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>{group.label}</h3>
        <span style={{ fontSize: 11.5, color: "#6e7681" }}>
          {group.options.length} {group.options.length === 1 ? "choice" : "choices"}
        </span>
        {group.multiple ? (
          <Tag text="pick any number" fg="#58a6ff" bg="#0d1b2a" />
        ) : null}
        {group.askedInQuickDesign ? (
          <Tag text="asked in Quick Design" fg="#3fb950" bg="#0d1f14" />
        ) : null}
      </div>
      {group.hint ? (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12.5,
            color: "#8b949e",
            lineHeight: 1.6,
            maxWidth: 780,
          }}
        >
          {group.hint}
        </p>
      ) : (
        <div style={{ height: 8 }} />
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                fontSize: 11,
                color: "#6e7681",
                fontWeight: 500,
                padding: "0 12px 6px 0",
                borderBottom: "1px solid #262c36",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              They choose
            </th>
            <th
              style={{
                textAlign: "left",
                fontSize: 11,
                color: "#6e7681",
                fontWeight: 500,
                padding: "0 0 6px",
                borderBottom: "1px solid #262c36",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              We send
            </th>
          </tr>
        </thead>
        <tbody>
          {group.options.map((option) => (
            <OptionRow
              key={option.value}
              option={option}
              isDefault={!group.multiple && option.value === group.defaultValue}
              tiered={tiered}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
