// How a shop's page LOOKS. Nothing here decides what it says.
//
// THE SEPARATION THIS FILE EXISTS TO KEEP
//
// `site_render.ts` owns the rule that nothing is invented: a day the shop has
// not stated is absent, a price it has not given reads "Price on request", a
// missing phone means no call button. A theme cannot reach any of that. It
// supplies CSS and nothing else, so no amount of styling can put a word on the
// page that the shop did not put in the database.
//
// That is deliberate. The first version of this page was plain because plain
// was easy to keep honest, and it read like a utility bill -- which undersells
// a business that is bought on how it looks. Style and honesty were never
// actually in tension; they were just built in the wrong order.
//
// TWO CONSTRAINTS EVERY THEME LIVES UNDER, both real
//
// 1. NO EXTERNAL RESOURCES. The page is served with
//    `default-src 'none'; style-src 'unsafe-inline'`, so there are no web
//    fonts, no CDN, no icon set. Everything is system font stacks and CSS the
//    browser can draw. This is a genuine limit on how far typography can go,
//    and loosening it means loosening the policy that makes the page inert.
//
// 2. NO PHOTOGRAPHY. Nothing in the platform can upload a file yet, so no
//    theme has an image to place. A great barbershop site is largely
//    photography, and none of these can be that until there is an upload path.
//    Each theme therefore has to earn its impact from type, colour, spacing
//    and rule-work -- which is achievable, and is not the same thing.

export interface SiteTheme {
  key: string;
  /** What to call it when showing a shop its options. */
  name: string;
  /** One line on who it suits, for the same conversation. */
  suits: string;
  css: string;
}

const SHARED = `
*{box-sizing:border-box}
body{margin:0;-webkit-text-size-adjust:100%}
.wrap{margin:0 auto;width:100%}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:inherit}
td{text-align:right}
.links{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap}
.actions{display:flex;flex-wrap:wrap}
.btn{display:inline-block;text-decoration:none}
img{max-width:100%}
.mark{display:block;width:100%;height:10px}
.hero{position:relative;overflow:hidden}
main{display:block}

/* The thumb-reach action bar. Phone only -- on a desktop the header CTA is
   already on screen and a floating bar would just be in the way. */
.stickybar{position:fixed;left:0;right:0;bottom:0;display:none;gap:10px;padding:12px 16px
calc(12px + env(safe-area-inset-bottom));z-index:50}
.sb-btn{flex:1;text-align:center;padding:15px 10px;text-decoration:none;font-weight:700;
font-size:16px;border-radius:8px}
@media (max-width:680px){
.stickybar{display:flex}
main{padding-bottom:88px}
}
`;

// ---------------------------------------------------------------------------
// CHAIR — dark, editorial, warm. The default.
//
// The look most WNY shops in the list already lean on in their own signage:
// dark walls, warm brass, a serif that has been there a while.
// ---------------------------------------------------------------------------
const CHAIR = `
:root{color-scheme:dark;--ink:#f7f2e8;--dim:#9a9183;--bg:#0e0d0c;--panel:#17140f;
--line:#2b2620;--accent:#c9963f;--stripe-a:#0e0d0c;--stripe-b:#c9963f;--stripe-c:#7d1f22}
body{background:var(--bg);color:var(--ink);
font:17px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:900px;padding:0 28px}

/* HERO — the whole first screen, not a heading with a rule under it. */
.hero{background:
radial-gradient(120% 90% at 50% -20%, #241d14 0%, rgba(14,13,12,0) 60%),
linear-gradient(180deg,#151210 0%,var(--bg) 100%);
padding:0 0 72px;border-bottom:1px solid var(--line)}
.hero .wrap{padding-top:76px}
.hero .mark{margin:0 0 54px;height:12px;opacity:.9}
h1{margin:0;font:600 clamp(46px,12vw,104px)/0.92 ui-serif,Georgia,'Times New Roman',serif;
letter-spacing:-.035em;max-width:14ch}
.tagline{margin:26px 0 0;font-size:clamp(19px,2.6vw,25px);line-height:1.35;color:var(--ink);
max-width:22ch;font-weight:400}
.place{margin:18px 0 0;font-size:12px;letter-spacing:.3em;text-transform:uppercase;
color:var(--accent)}
.actions{gap:12px;margin:44px 0 0}
.btn{padding:17px 32px;border:1px solid var(--line);color:var(--ink);font-size:15px;
font-weight:600;border-radius:2px;transition:background .15s,border-color .15s,color .15s}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#171008}
.btn.primary:hover{background:#dda94e;border-color:#dda94e;color:#171008}

/* SECTIONS — numbered, generous, with the label set against the content. */
main{padding:0 0 40px}
section{padding:72px 0 0}
section+section{border-top:1px solid var(--line);margin-top:72px;padding-top:72px}
h2{margin:0 0 30px;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.32em;
text-transform:uppercase;color:var(--accent)}

/* Hours and services as a designed list, not a data table. */
th,td{padding:19px 0;border-bottom:1px solid var(--line);vertical-align:baseline}
tr:last-child th,tr:last-child td{border-bottom:0}
th{font-size:clamp(19px,2.4vw,24px);font-weight:500;letter-spacing:-.01em}
td{color:var(--dim);font-variant-numeric:tabular-nums;font-size:17px;white-space:nowrap;
padding-left:20px}
.price{color:var(--accent);font-weight:600;font-size:clamp(19px,2.4vw,24px)}
.muted{color:var(--dim);font-weight:400;font-size:15px}
.closed{color:var(--dim);font-style:italic}
.dur{display:block;font-size:13px;letter-spacing:.14em;text-transform:uppercase;
color:var(--dim);margin:7px 0 0;font-weight:400}
.note{margin:26px 0 0;font-size:14px;color:var(--dim);max-width:52ch}
.addr{margin:0;font:400 clamp(24px,4vw,38px)/1.25 ui-serif,Georgia,serif;max-width:16ch;
letter-spacing:-.02em}
.map{display:inline-block;margin:22px 0 0;color:var(--accent);font-size:15px;font-weight:600;
border-bottom:1px solid currentColor;padding-bottom:3px;text-decoration:none}
.links{gap:12px}
.links a{color:var(--ink);border:1px solid var(--line);padding:12px 22px;text-decoration:none;
font-size:14px;letter-spacing:.06em;transition:border-color .15s}
.links a:hover{border-color:var(--accent)}
section p{margin:0 0 20px;font-size:clamp(18px,2.2vw,21px);line-height:1.55;color:var(--ink);
max-width:34ch}
footer{padding:44px 0 56px;border-top:1px solid var(--line);font-size:13px;color:var(--dim);
letter-spacing:.04em}
.empty{margin:40px 0;padding:26px;border:1px dashed var(--line);color:var(--dim);max-width:46ch}
.stickybar{background:rgba(14,13,12,.94);border-top:1px solid var(--line);
backdrop-filter:blur(8px)}
.sb-btn{background:transparent;border:1px solid var(--line);color:var(--ink)}
.sb-primary{background:var(--accent);border-color:var(--accent);color:#171008}
@media (max-width:680px){
.hero{padding-bottom:52px}
.hero .wrap{padding-top:52px}
.hero .mark{margin-bottom:38px}
section,section+section{padding-top:54px}
section+section{margin-top:54px}
td{font-size:16px}
}
`;

// ---------------------------------------------------------------------------
// FADE — bright, modern, high contrast. Big type, tight grid.
//
// For the shops that already look like this on Instagram: white walls, one
// strong colour, everything squared off.
// ---------------------------------------------------------------------------
const FADE = `
:root{color-scheme:light;--ink:#0b0b0c;--dim:#6b6b73;--bg:#fbfbf9;--line:#e4e4de;
--accent:#1c5cff}
body{background:var(--bg);color:var(--ink);
font:16px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:720px;padding:56px 24px 88px}
header{padding-bottom:30px}
h1{margin:0;font-size:clamp(38px,9vw,68px);line-height:.98;letter-spacing:-.045em;
font-weight:800}
.tagline{margin:16px 0 0;font-size:19px;color:var(--dim);max-width:40ch}
.actions{gap:8px;margin:30px 0 0}
.btn{padding:14px 24px;border:2px solid var(--ink);color:var(--ink);font-weight:650;
font-size:15px;border-radius:999px}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
section{margin:52px 0 0}
h2{margin:0 0 14px;font-size:13px;font-weight:750;letter-spacing:.02em;color:var(--dim)}
th,td{padding:14px 0;border-bottom:1px solid var(--line)}
th{font-size:17px;font-weight:600}
td{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:600}
.muted,.closed,.note,.dur{color:var(--dim);font-weight:400}
.dur{font-size:13px;margin-left:10px}
.note{margin:14px 0 0;font-size:13px}
.addr{margin:0;font-size:18px;font-weight:600}
.map{color:var(--accent);font-weight:600}
.links{gap:10px}
.links a{color:var(--ink);text-decoration:none;border:1px solid var(--line);
padding:8px 15px;border-radius:999px;font-size:14px}
.links a:hover{border-color:var(--ink)}
section p{margin:0 0 14px;color:var(--dim);max-width:58ch}
footer{margin:68px 0 0;padding-top:20px;border-top:2px solid var(--ink);font-size:13px;
color:var(--dim)}
.empty{margin:36px 0 0;padding:20px;border:1px dashed var(--line);color:var(--dim);
border-radius:12px}
`;

// ---------------------------------------------------------------------------
// POLE — vintage americana. Cream, navy, barber red.
//
// The oldest shops in the list trade on having been there forty years. This
// says that without a photograph.
// ---------------------------------------------------------------------------
const POLE = `
:root{color-scheme:light;--ink:#16233c;--dim:#5d6a83;--bg:#f7f2e7;--line:#ddd2ba;
--accent:#b3202c}
body{background:var(--bg);color:var(--ink);
font:16px/1.62 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:640px;padding:0 24px 88px}
header{padding:52px 0 30px;text-align:center;
border-bottom:3px double var(--line)}
h1{margin:0;font:700 clamp(32px,7.5vw,50px)/1.05 ui-serif,Georgia,'Times New Roman',serif;
letter-spacing:.01em;text-transform:uppercase}
.tagline{margin:14px auto 0;font-size:17px;color:var(--dim);max-width:38ch;font-style:italic}
.actions{gap:10px;margin:26px 0 0;justify-content:center}
.btn{padding:12px 22px;border:1.5px solid var(--ink);color:var(--ink);font-size:14px;
letter-spacing:.09em;text-transform:uppercase;font-weight:650}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
section{margin:48px 0 0;text-align:center}
h2{margin:0 0 16px;font:700 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.26em;
text-transform:uppercase;color:var(--accent)}
table{text-align:left}
th,td{padding:12px 0;border-bottom:1px dotted var(--line)}
th{font-size:16px}
td{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:650}
.muted,.closed,.note,.dur{color:var(--dim);font-weight:400}
.dur{font-size:13px;margin-left:9px;font-style:italic}
.note{margin:15px 0 0;font-size:13px}
.addr{margin:0;font-size:17px}
.map{color:var(--accent)}
.links{gap:16px;justify-content:center}
.links a{color:var(--ink);text-decoration:none;border-bottom:1.5px solid var(--accent);
font-size:14px;letter-spacing:.06em;text-transform:uppercase}
section p{margin:0 0 14px;color:var(--dim);max-width:56ch;margin-left:auto;margin-right:auto}
footer{margin:64px 0 0;padding-top:20px;border-top:3px double var(--line);font-size:13px;
color:var(--dim);text-align:center}
.empty{margin:36px 0 0;padding:20px;border:1px dashed var(--line);color:var(--dim)}
`;

export const THEMES: readonly SiteTheme[] = [
  {
    key: "chair",
    name: "Chair",
    suits:
      "Dark, editorial and warm. The look most traditional shops already use on their own signage.",
    css: SHARED + CHAIR,
  },
  {
    key: "fade",
    name: "Fade",
    suits:
      "Bright, modern, high contrast. For shops whose Instagram is white walls and one strong colour.",
    css: SHARED + FADE,
  },
  {
    key: "pole",
    name: "Pole",
    suits:
      "Vintage americana in cream, navy and barber red. For shops that trade on having been there forty years.",
    css: SHARED + POLE,
  },
] as const;

export const DEFAULT_THEME = "chair";

/**
 * A theme by key, falling back to the default.
 *
 * Falls back rather than throwing on purpose: an unknown key is a
 * configuration mistake, and a shop's page going dark over one would be a far
 * worse outcome than the page looking different from what was expected.
 */
export function themeByKey(key: string | null | undefined): SiteTheme {
  const k = (key ?? "").trim().toLowerCase();
  return THEMES.find((t) => t.key === k) ?? THEMES[0]!;
}
