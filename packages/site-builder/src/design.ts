// The shared HLG static-site design, recovered from the six live HLG sites
// (ddhhomeservices.com, hermanlegacygroup.com and the others, which are
// byte-identical apart from three accent colours). The generator that made
// them is not in any repository, so this is that design as data: the same
// tokens and components, trimmed to what a one-page demo uses, plus the demo
// banner and "sample" marker. No scripts: the page works without JavaScript.

import type { SiteVertical } from "./types.ts";
import { SITE_VERTICAL_REGISTRY, verticalDef } from "./verticals.ts";

export type Accent = { accent: string; dark: string; soft: string };

/** Per-vertical accent, in the same three-token form the live sites use (from the registry). */
export const ACCENTS = Object.fromEntries(
  Object.values(SITE_VERTICAL_REGISTRY).map((d) => [d.key, d.accent]),
) as Record<SiteVertical, Accent>;

export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap";

export function siteCss(v: SiteVertical, brand?: Accent): string {
  const a = brand ?? verticalDef(v).accent;
  return `:root{--ink:#13283d;--ink-2:#1d3a54;--ink-soft:#3a4f63;--paper:#f7f4ee;--paper-2:#fffefa;--card:#fff;--line:#e6ded0;--line-2:#efe9dd;--muted:#5d6b78;--brass:#c0892d;--brass-dark:#9a6a1d;--accent:${a.accent};--accent-dark:${a.dark};--accent-soft:${a.soft};--shadow-sm:0 1px 2px rgba(19,40,61,.05),0 4px 14px rgba(19,40,61,.06);--shadow:0 2px 6px rgba(19,40,61,.06),0 18px 44px rgba(19,40,61,.10);--radius:14px;--radius-sm:9px;--maxw:1160px}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--paper);line-height:1.62;font-size:17px;-webkit-font-smoothing:antialiased}
a{color:var(--accent-dark);text-decoration:none}a:hover{color:var(--accent)}
h1,h2,h3{font-family:'Fraunces',Georgia,serif;color:var(--ink);line-height:1.08;margin:0 0 .45em;font-weight:600;letter-spacing:-.01em}
h1{font-size:clamp(2.3rem,5.2vw,3.7rem)}h2{font-size:clamp(1.7rem,3.4vw,2.5rem)}h3{font-size:1.3rem}
p{margin:0 0 1.1em}.wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
.eyebrow{display:inline-flex;align-items:center;gap:.6rem;font-weight:600;font-size:.74rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-dark);margin:0 0 1rem}
.eyebrow::before{content:"";width:26px;height:2px;background:var(--brass);display:inline-block}
.lede{font-size:1.18rem;color:var(--ink-soft);max-width:62ch}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;font-weight:600;font-size:.97rem;padding:.85rem 1.5rem;border-radius:var(--radius-sm);border:1.5px solid transparent;line-height:1}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}.btn-primary:hover{background:var(--accent-dark);color:#fff}
.btn-light{background:#fff;color:var(--ink);border-color:#fff}.btn-light:hover{color:var(--ink)}
.btn-outline-light{background:transparent;color:#fff;border-color:rgba(255,255,255,.45)}.btn-outline-light:hover{color:#fff;border-color:#fff}
.btn-row{display:flex;flex-wrap:wrap;gap:.85rem;margin-top:1.8rem}
.demo-banner{background:#fff4d6;color:#5a4300;border-bottom:1px solid #e9d39a;font-size:.86rem;padding:.55rem 24px;text-align:center}
.demo-banner strong{color:#3d2d00}
.site-header{background:rgba(247,244,238,.95);border-bottom:1px solid var(--line)}
.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:84px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.85rem;color:var(--ink)}
.brand-mark{width:50px;height:50px;flex:0 0 50px;border-radius:11px;background:linear-gradient(160deg,var(--ink),var(--ink-2));color:#f3d99a;font-family:'Fraunces',serif;font-weight:600;font-size:1.25rem;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px var(--brass),inset 0 0 0 5px var(--ink)}
.brand-name{font-family:'Fraunces',serif;font-weight:600;font-size:1.25rem}
.nav-links{display:flex;flex-wrap:wrap;gap:.2rem;list-style:none;margin:0;padding:0}
.nav-links a{color:var(--ink-soft);font-weight:500;font-size:.93rem;padding:.5rem .7rem;border-radius:7px}
.hero{position:relative;overflow:hidden;background:var(--ink);color:#f1ece2}
.hero::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 85% -10%,color-mix(in srgb,var(--accent) 38%,transparent),transparent 60%),radial-gradient(90% 70% at 5% 110%,rgba(192,137,45,.2),transparent 55%)}
.hero .wrap{position:relative;padding:clamp(4rem,9vw,7rem) 24px}
.hero h1{color:#fff}.hero .eyebrow{color:#f3d99a}.hero .eyebrow::before{background:#f3d99a}
.hero p{color:#cdd6df;font-size:1.2rem;max-width:60ch}
.rating{display:inline-flex;align-items:center;gap:.6rem;margin-top:1.6rem;padding:.55rem .9rem;border:1px solid rgba(255,255,255,.18);border-radius:999px;color:#f1ece2;font-size:.95rem}
.rating .stars{color:#f3d99a;letter-spacing:.08em}.rating .src{color:#aeb9c4;font-size:.82rem}
.section{padding:clamp(3.5rem,7vw,5.5rem) 0}
.section-tint{background:var(--paper-2);border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2)}
.section-head{max-width:64ch;margin-bottom:2.2rem}
.grid{display:grid;gap:1.4rem}.g-2{grid-template-columns:repeat(2,1fr)}.g-3{grid-template-columns:repeat(3,1fr)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1.6rem;box-shadow:var(--shadow-sm);position:relative;overflow:hidden}
.card::before{content:"";position:absolute;left:0;top:0;height:3px;width:46px;background:var(--accent);border-radius:0 3px 3px 0}
.card h3{margin-bottom:.4rem}.card p{color:var(--muted);font-size:.98rem;margin:0}
.card .ico{width:44px;height:44px;border-radius:10px;background:var(--accent-soft);color:var(--accent-dark);display:flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-weight:600;margin-bottom:1rem}
.sample{display:inline-block;margin-left:.5rem;padding:.1rem .45rem;border-radius:5px;background:#fff4d6;border:1px solid #e9d39a;color:#5a4300;font-family:'Inter',sans-serif;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;vertical-align:middle}
.split{display:grid;grid-template-columns:1.1fr 1fr;gap:3rem;align-items:start}
.panel{background:var(--ink);color:#e7ecf1;border-radius:var(--radius);padding:2rem;box-shadow:var(--shadow)}
.panel h3{color:#fff}.panel a{color:#f3d99a}
.info-list{list-style:none;padding:0;margin:0;display:grid;gap:1.1rem}
.info-list .k{font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:#aeb9c4;font-weight:700}
.info-list .v{font-weight:500}
.video{aspect-ratio:16/9;border-radius:var(--radius);border:2px dashed var(--line);background:var(--paper-2);display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted);padding:1.5rem}
.form-wrap{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:2rem;box-shadow:var(--shadow-sm)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.1rem}
.field{display:flex;flex-direction:column;gap:.35rem}.field.full{grid-column:1/-1}
.field label{font-size:.85rem;font-weight:600}
.field input,.field textarea{font:inherit;font-size:.97rem;padding:.72rem .85rem;border:1.5px solid var(--line);border-radius:9px;background:var(--paper-2);width:100%}
.form-note{font-size:.88rem;color:var(--muted);margin-top:1rem}
.cta-band{background:var(--ink);color:#fff;border-radius:18px;padding:clamp(2.2rem,5vw,3.2rem);text-align:center}
.cta-band h2{color:#fff}.cta-band p{color:#cdd6df}.cta-band .btn-row{justify-content:center}
.site-footer{background:var(--ink);color:#aeb9c4;padding:2.6rem 0 1.6rem;font-size:.9rem}
.site-footer a{color:#aeb9c4}.foot-note{margin-top:1.2rem;padding-top:1.2rem;border-top:1px solid rgba(255,255,255,.12);color:#8290a0;font-size:.82rem}
@media(max-width:820px){.g-2,.g-3,.split,.form-grid{grid-template-columns:1fr}.nav{padding-top:.8rem;padding-bottom:.8rem}body{font-size:16px}}`;
}
