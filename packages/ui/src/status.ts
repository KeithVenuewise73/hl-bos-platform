/**
 * The shared status vocabulary of Herman Legacy Cloud.
 *
 * One set of names, colors and labels for "how is this doing", rendered
 * identically by the operator plane (Headquarters) and the hosted cloud plane.
 * The operator plane's health logic computes these values; this package owns
 * only what they look like and what they are called.
 */
export type Health = "green" | "yellow" | "red" | "unknown";

/** Dot color for each status, tuned for the dark shell. */
export const DOT: Record<Health, string> = {
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  unknown: "#6e7681",
};

/** Human label for each status. Never a raw status string in the UI. */
export const LABEL: Record<Health, string> = {
  green: "Healthy",
  yellow: "Working",
  red: "Needs attention",
  unknown: "Not visible",
};
