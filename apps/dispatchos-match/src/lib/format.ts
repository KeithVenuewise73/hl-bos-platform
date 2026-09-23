// Display helpers. Kept out of components so they can be unit-tested.

export const usd = (n: number, digits = 0): string => {
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${n < 0 ? "−" : ""}$${s}`;
};

export const perMile = (n: number): string => `${usd(n, 2)}/mi`;

export const miles = (n: number): string =>
  `${Math.round(n).toLocaleString("en-US")} mi`;

export const lbs = (n: number): string => `${n.toLocaleString("en-US")} lb`;

/** Parse a user-typed number; null (not NaN, not 0) when it is not one. */
export function parseNumberInput(raw: string): number | null {
  const t = raw.trim().replace(/[$,]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
