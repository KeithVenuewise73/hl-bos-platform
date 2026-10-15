// Premium Business Site themes: design presets, not businesses. A Business
// Profile picks one (profile.design.theme); the components never name a
// business. Every text/background pair below is checked against WCAG 2.2 AA
// in premium.test.ts (contrastRatio), so a theme edit that weakens
// readability fails the build.

export interface FontFace {
  family: string;
  /** File under assets/fonts (SIL Open Font License, bundled; no remote fonts). */
  file: string;
  /** Variable weight range the file covers. */
  weights: string;
}

export interface PremiumTheme {
  key: string;
  label: string;
  description: string;
  display: FontFace;
  body: FontFace;
  /** Fallback stacks, so text renders at once and never waits on a font. */
  displayFallback: string;
  bodyFallback: string;
  /** Uppercase, tracked display headings (industrial) or sentence case (editorial). */
  displayCase: "none" | "uppercase";
  displayWeight: number;
  /** The hero's composition: concentric layers, or a route through the chain. */
  hero: "layers" | "route";
  radius: string;
  colors: {
    /** Page background and the alternate band. */
    bg: string;
    band: string;
    surface: string;
    ink: string;
    muted: string;
    line: string;
    /** Accent used for text and icons on light backgrounds. */
    accentText: string;
    /** Decorative accent (rules, markers); never used for body text. */
    accent: string;
    /** Dark sections: hero, CTA band, footer. */
    dark: string;
    darkRaised: string;
    darkInk: string;
    darkMuted: string;
    darkAccent: string;
    /** Primary button. */
    button: string;
    buttonInk: string;
    /** Keyboard focus ring on light sections, and on dark ones. */
    focus: string;
    focusDark: string;
    /** Internal-draft markers. */
    notice: string;
    noticeInk: string;
  };
}

const INTER: FontFace = {
  family: "Inter Variable",
  file: "inter-latin-wght-normal.woff2",
  weights: "100 900",
};

export const PREMIUM_THEMES: Record<string, PremiumTheme> = {
  atelier: {
    key: "atelier",
    label: "Atelier — charcoal, brass and cream",
    description:
      "Editorial and composed: a near-black foundation, brass accents and warm cream pages, with a serif display face. For advisory and transformation firms.",
    display: {
      family: "Fraunces Variable",
      file: "fraunces-latin-wght-normal.woff2",
      weights: "100 900",
    },
    body: INTER,
    displayFallback: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
    bodyFallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    displayCase: "none",
    displayWeight: 560,
    hero: "layers",
    radius: "14px",
    colors: {
      bg: "#f6f1e7",
      band: "#efe7d8",
      surface: "#fffcf6",
      ink: "#191612",
      muted: "#5a5247",
      line: "#e1d6c2",
      accentText: "#7a5310",
      accent: "#c0892d",
      dark: "#151311",
      darkRaised: "#211e1a",
      darkInk: "#f5f0e6",
      darkMuted: "#c4baa9",
      darkAccent: "#d6a755",
      button: "#c99636",
      buttonInk: "#14110d",
      focus: "#1f5fbf",
      focusDark: "#8ab4ff",
      notice: "#fff3d1",
      noticeInk: "#5a4300",
    },
  },
  meridian: {
    key: "meridian",
    label: "Meridian — navy, steel and teal",
    description:
      "Operational and structured: deep navy, steel blue and a controlled teal, with an industrial grotesque display face and diagram-led layouts. For transportation, logistics and operations firms.",
    display: {
      family: "Archivo Variable",
      file: "archivo-latin-wght-normal.woff2",
      weights: "100 900",
    },
    body: INTER,
    displayFallback: "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
    bodyFallback: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    displayCase: "none",
    displayWeight: 700,
    hero: "route",
    radius: "6px",
    colors: {
      bg: "#f3f5f8",
      band: "#e8edf2",
      surface: "#ffffff",
      ink: "#0f1b29",
      muted: "#4b5d70",
      line: "#d3dbe4",
      accentText: "#006d77",
      accent: "#14919b",
      dark: "#0f2236",
      darkRaised: "#17304a",
      darkInk: "#eef3f8",
      darkMuted: "#b3c3d4",
      darkAccent: "#5cc6cf",
      button: "#007c87",
      buttonInk: "#ffffff",
      focus: "#0b5cad",
      focusDark: "#f2a541",
      notice: "#fff3d1",
      noticeInk: "#5a4300",
    },
  },
};

export const DEFAULT_THEME = "atelier";

export function premiumTheme(key: string | undefined): PremiumTheme {
  return PREMIUM_THEMES[key ?? DEFAULT_THEME] ?? PREMIUM_THEMES[DEFAULT_THEME]!;
}

// --- WCAG contrast ----------------------------------------------------------

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** The text/background pairs a theme uses, with the ratio each must meet. */
export function contrastPairs(
  t: PremiumTheme,
): { name: string; fg: string; bg: string; min: number }[] {
  const c = t.colors;
  return [
    { name: "Body text on page", fg: c.ink, bg: c.bg, min: 4.5 },
    { name: "Body text on cards", fg: c.ink, bg: c.surface, min: 4.5 },
    { name: "Secondary text on page", fg: c.muted, bg: c.bg, min: 4.5 },
    { name: "Secondary text on band", fg: c.muted, bg: c.band, min: 4.5 },
    { name: "Accent text on page", fg: c.accentText, bg: c.bg, min: 4.5 },
    { name: "Accent text on cards", fg: c.accentText, bg: c.surface, min: 4.5 },
    { name: "Text on dark sections", fg: c.darkInk, bg: c.dark, min: 4.5 },
    { name: "Secondary text on dark", fg: c.darkMuted, bg: c.dark, min: 4.5 },
    {
      name: "Secondary text on raised dark",
      fg: c.darkMuted,
      bg: c.darkRaised,
      min: 4.5,
    },
    { name: "Accent on dark (eyebrows)", fg: c.darkAccent, bg: c.dark, min: 4.5 },
    { name: "Primary button text", fg: c.buttonInk, bg: c.button, min: 4.5 },
    { name: "Draft notices", fg: c.noticeInk, bg: c.notice, min: 4.5 },
    { name: "Focus ring on page", fg: c.focus, bg: c.bg, min: 3 },
    { name: "Focus ring on dark", fg: c.focusDark, bg: c.dark, min: 3 },
  ];
}
