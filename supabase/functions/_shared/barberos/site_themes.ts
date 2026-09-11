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
body{margin:0}
.wrap{margin:0 auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-weight:inherit}
td{text-align:right}
.links{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap}
.actions{display:flex;flex-wrap:wrap}
.btn{display:inline-block;text-decoration:none}
img{max-width:100%}
@media (max-width:520px){
.wrap{padding-left:18px;padding-right:18px}
h1{font-size:clamp(30px,9vw,44px)}
}
`;

// ---------------------------------------------------------------------------
// CHAIR — dark, editorial, warm. The default.
//
// The look most WNY shops in the list already lean on in their own signage:
// dark walls, warm brass, a serif that has been there a while.
// ---------------------------------------------------------------------------
const CHAIR = `
:root{color-scheme:dark;--ink:#f2ede4;--dim:#a1968a;--bg:#12100e;--panel:#1a1714;
--line:#2e2823;--accent:#c8934a}
body{background:var(--bg);color:var(--ink);
font:16px/1.65 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:660px;padding:64px 24px 96px}
header{padding-bottom:34px;border-bottom:1px solid var(--line)}
h1{margin:0;font:600 clamp(34px,7vw,52px)/1.03 ui-serif,Georgia,'Times New Roman',serif;
letter-spacing:-.02em}
.tagline{margin:14px 0 0;font-size:18px;color:var(--dim);max-width:42ch}
.actions{gap:10px;margin:28px 0 0}
.btn{padding:13px 22px;border:1px solid var(--line);color:var(--ink);font-size:15px;
border-radius:2px;transition:border-color .15s}
.btn:hover{border-color:var(--accent)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#17120b;font-weight:600}
section{margin:56px 0 0}
h2{margin:0 0 18px;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;
letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
th,td{padding:13px 0;border-bottom:1px solid var(--line)}
th{font-size:16px}
td{color:var(--dim);font-variant-numeric:tabular-nums}
.price{color:var(--ink);font-weight:600}
.muted,.closed,.note,.dur{color:var(--dim)}
.dur{font-size:13px;margin-left:10px}
.note{margin:16px 0 0;font-size:13px}
.addr{margin:0;font-size:17px}
.map{color:var(--accent)}
.links{gap:18px;margin-top:2px}
.links a{color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:2px;
text-decoration:none}
.links a:hover{border-color:var(--accent)}
section p{margin:0 0 14px;color:var(--dim);max-width:60ch}
footer{margin:72px 0 0;padding-top:22px;border-top:1px solid var(--line);
font-size:13px;color:var(--dim)}
.empty{margin:40px 0 0;padding:22px;border:1px dashed var(--line);color:var(--dim)}
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
