// Colour tokens and CSS. Colours come from the client's brand/accent; every
// text colour that sits on one is derived with onColor(), so a client cannot
// pick an unreadable combination. Fixed neutrals are chosen to pass AA too.

import {
  FONT_STACKS,
  isFontKey,
  isHexColor,
  mixHex,
  onColor,
  type Theme,
} from "@hl-bos/sitegen-spec";

const FALLBACK = { brand: "#1f2937", accent: "#c8a24a" } as const;

export interface ColorTokens {
  "--brand": string;
  "--on-brand": string;
  "--accent": string;
  "--on-accent": string;
  "--hero-from": string;
  "--hero-to": string;
  "--on-hero": string;
  "--bg": string;
  "--surface": string;
  "--text": string;
  "--muted": string;
  "--line": string;
}

export function colorTokens(
  theme: Pick<Theme, "brandColor" | "accentColor">,
): ColorTokens {
  // Defensive: the spec is validated upstream, but this value goes into a <style>.
  const brand = isHexColor(theme.brandColor)
    ? theme.brandColor.toLowerCase()
    : FALLBACK.brand;
  const accent = isHexColor(theme.accentColor)
    ? theme.accentColor.toLowerCase()
    : FALLBACK.accent;
  const onBrand = onColor(brand);
  // The hero gradient moves AWAY from the text colour, so contrast only improves
  // along it: white text on a gradient that darkens, black text on one that lightens.
  const heroTo = mixHex(brand, onBrand === "#ffffff" ? "#000000" : "#ffffff", 0.35);
  return {
    "--brand": brand,
    "--on-brand": onBrand,
    "--accent": accent,
    "--on-accent": onColor(accent),
    "--hero-from": brand,
    "--hero-to": heroTo,
    "--on-hero": onBrand,
    "--bg": "#ffffff",
    "--surface": "#f5f5f4",
    "--text": "#1c1917",
    "--muted": "#57534e",
    "--line": "#d6d3d1",
  };
}

/** Every text-on-background pair the stylesheet uses. Tested for >= 4.5:1. */
export const TEXT_PAIRS: readonly (readonly [
  fg: keyof ColorTokens,
  bg: keyof ColorTokens,
])[] = [
  ["--text", "--bg"],
  ["--muted", "--bg"],
  ["--text", "--surface"],
  ["--muted", "--surface"],
  ["--on-brand", "--brand"],
  ["--on-accent", "--accent"],
  ["--on-hero", "--hero-from"],
  ["--on-hero", "--hero-to"],
];

export function buildCss(theme: Theme): string {
  const t = colorTokens(theme);
  const vars = Object.entries(t)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const fh = isFontKey(theme.fontHeading)
    ? FONT_STACKS[theme.fontHeading]
    : FONT_STACKS.sans_clean;
  const fb = isFontKey(theme.fontBody)
    ? FONT_STACKS[theme.fontBody]
    : FONT_STACKS.sans_clean;
  return `:root{${vars};--fh:${fh};--fb:${fb}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:1rem/1.6 var(--fb);overflow-wrap:anywhere}
img{max-width:100%;height:auto;display:block}
h1,h2,h3{font-family:var(--fh);line-height:1.2;margin:0 0 .5em}
h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.1rem}
p{margin:0 0 1em}
a{color:inherit}
.w{max-width:44rem;margin:0 auto;padding:0 1rem}
.hdr{border-bottom:1px solid var(--line)}
.hdr .w{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 1rem;padding-top:.75rem;padding-bottom:.75rem}
.brand{display:flex;align-items:center;gap:.6rem;font:700 1.15rem var(--fh);text-decoration:none}
.brand img{height:2.5rem;width:auto;max-width:10rem}
.nav{display:flex;flex-wrap:wrap;gap:.25rem 1rem;font-size:.95rem}
.nav a{padding:.5rem 0}
.hero{background:linear-gradient(135deg,var(--hero-from),var(--hero-to));color:var(--on-hero)}
.hero .w{padding-top:3rem;padding-bottom:3rem}
.hero p.sub{font-size:1.15rem}
.hero-img{width:100%;aspect-ratio:16/9;object-fit:cover}
.btns{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.25rem}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:.6rem 1.25rem;border-radius:.5rem;font-weight:700;text-decoration:none;border:2px solid transparent}
.btn.p{background:var(--accent);color:var(--on-accent)}
.btn.s{border-color:currentColor;color:inherit}
.sec{padding:2.25rem 0}
.sec.alt{background:var(--surface)}
.muted{color:var(--muted)}
.list{list-style:none;margin:0;padding:0}
.list li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem 1rem;padding:.75rem 0;border-bottom:1px solid var(--line)}
.list .d{flex-basis:100%;color:var(--muted);font-size:.95rem}
.price{font-weight:700}
.hours{width:100%;border-collapse:collapse}
.hours th,.hours td{padding:.5rem 0;border-bottom:1px solid var(--line);text-align:left;font-weight:400}
.hours td{text-align:right}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:.75rem;margin:0;padding:0;list-style:none}
.gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:.4rem}
.contact .btn.p{background:var(--brand);color:var(--on-brand)}
.contact .btn.s{background:var(--accent);color:var(--on-accent);border-color:transparent}
address{font-style:normal;margin-bottom:1rem}
details{border-bottom:1px solid var(--line);padding:.75rem 0}
summary{cursor:pointer;font-weight:700;min-height:2rem}
.ftr{background:var(--surface);color:var(--muted);padding:1.5rem 0;font-size:.95rem}
.ftr p{margin:0 0 .25rem}
@media(min-width:40rem){h1{font-size:2.75rem}.hero .w{padding-top:5rem;padding-bottom:5rem}.sec{padding:3rem 0}}`;
}
