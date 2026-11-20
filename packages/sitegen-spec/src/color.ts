// WCAG 2.x contrast maths. Used so that text on a client-chosen brand colour is
// always readable: the client picks colours, the renderer picks the text colour.

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function rgb(hex: string): [number, number, number] {
  if (!isHexColor(hex)) throw new Error(`not a #rrggbb colour: ${String(hex)}`);
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. Order of arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white, whichever reads better on `background`. For any background
 * the better of the two is at least about 4.58:1, so this always meets the WCAG
 * AA threshold of 4.5:1 for normal text.
 */
export function onColor(background: string): "#000000" | "#ffffff" {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}

/** Linear mix of two colours; t = 0 gives `a`, t = 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  const out = ca.map((c, i) => Math.round(c + (cb[i]! - c) * t));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
