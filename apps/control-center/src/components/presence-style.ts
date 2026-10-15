import type { CSSProperties } from "react";

// Shared look for the Presence Scanner screens, matching the console's palette.

export const C = {
  text: "#e8eaed",
  muted: "#8b949e",
  border: "#30363d",
  panel: "#12151a",
  field: "#0b0d10",
  link: "#58a6ff",
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  grey: "#6e7681",
};

export const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: C.field,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  padding: "8px 10px",
  fontSize: 13,
};

export const label: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: C.muted,
  margin: "0 0 4px",
};

export const button = (primary = false, disabled = false): CSSProperties => ({
  background: disabled ? "#21262d" : primary ? "#238636" : "#21262d",
  color: disabled ? C.grey : C.text,
  border: `1px solid ${primary && !disabled ? "#2ea043" : C.border}`,
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  cursor: disabled ? "not-allowed" : "pointer",
});

export const scoreColour = (s: number) =>
  s >= 70 ? C.red : s >= 45 ? C.yellow : C.green;

export const QUAL_COLOUR = {
  qualified: C.green,
  needs_review: C.yellow,
  excluded: C.grey,
} as const;
