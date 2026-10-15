// The Premium Business Site stylesheet, generated from a theme's tokens.
// One file (assets/site.css) shared by every page. No remote assets: the
// fonts are the bundled OFL files beside it. Accessibility is built in:
// visible focus rings (separate colours for light and dark sections), a skip
// link, reduced-motion support, and type that holds at 200% zoom.

import type { PremiumTheme } from "./themes.ts";

export function premiumCss(t: PremiumTheme): string {
  const c = t.colors;
  const display = `'${t.display.family}', ${t.displayFallback}`;
  const body = `'${t.body.family}', ${t.bodyFallback}`;
  const upper = t.displayCase === "uppercase";
  return `@font-face{font-family:'${t.display.family}';src:url("fonts/${t.display.file}") format("woff2");font-weight:${t.display.weights};font-style:normal;font-display:swap}
@font-face{font-family:'${t.body.family}';src:url("fonts/${t.body.file}") format("woff2");font-weight:${t.body.weights};font-style:normal;font-display:swap}
:root{--bg:${c.bg};--band:${c.band};--surface:${c.surface};--ink:${c.ink};--muted:${c.muted};--line:${c.line};--accent:${c.accent};--accent-text:${c.accentText};--dark:${c.dark};--dark-raised:${c.darkRaised};--dark-ink:${c.darkInk};--dark-muted:${c.darkMuted};--dark-accent:${c.darkAccent};--button:${c.button};--button-ink:${c.buttonInk};--focus:${c.focus};--focus-dark:${c.focusDark};--notice:${c.notice};--notice-ink:${c.noticeInk};--radius:${t.radius};--display:${display};--body:${body};--wrap:1200px;--gutter:clamp(20px,5vw,48px);--section:clamp(4.5rem,9vw,7.5rem)}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:96px}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:1.0625rem;line-height:1.65;font-feature-settings:"ss01","cv11";-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img,svg{display:block;max-width:100%}
a{color:var(--accent-text);text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:4px}
.on-dark :focus-visible,.on-dark:focus-visible{outline-color:var(--focus-dark)}
h1,h2,h3{font-family:var(--display);font-weight:${t.displayWeight};line-height:1.06;letter-spacing:${upper ? "0.02em" : "-0.022em"};margin:0;${upper ? "text-transform:uppercase;" : ""}font-optical-sizing:auto;text-wrap:balance}
h1{font-size:clamp(2.55rem,5.6vw,4.75rem)}
h2{font-size:clamp(2rem,3.6vw,3rem)}
h3{font-size:1.28rem;line-height:1.25;letter-spacing:-0.01em}
p{margin:0}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 var(--gutter)}
.skip{position:absolute;left:var(--gutter);top:-100px;z-index:100;background:var(--ink);color:var(--bg);padding:.7rem 1rem;border-radius:8px;font-weight:600;text-decoration:none}
.skip:focus{top:12px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
/* Internal-draft banner */
.draft{background:var(--notice);color:var(--notice-ink);font-size:.86rem;line-height:1.45;border-bottom:1px solid rgba(0,0,0,.08)}
.draft .wrap{display:flex;flex-wrap:wrap;gap:.35rem 1.4rem;align-items:center;padding-top:.55rem;padding-bottom:.55rem}
.draft strong{font-weight:700}
/* Header */
.site-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:1.5rem;min-height:76px}
.brand{display:flex;align-items:center;gap:.8rem;color:var(--ink);text-decoration:none;margin-right:auto;min-width:0}
.mark{flex:0 0 auto;display:grid;place-items:center;min-width:44px;height:44px;padding:0 .55rem;border-radius:calc(var(--radius) * .7);background:var(--dark);color:var(--dark-accent);font-family:var(--display);font-weight:700;font-size:.95rem;letter-spacing:.06em}
.brand-name{font-family:var(--display);font-weight:${t.displayWeight};font-size:1.12rem;line-height:1.15;letter-spacing:${upper ? ".03em" : "-.01em"}}
.brand-name small{display:block;font-family:var(--body);font-weight:500;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:.15rem}
.nav{display:flex;align-items:center;gap:.25rem}
.nav a{color:var(--ink);text-decoration:none;font-weight:500;font-size:.95rem;padding:.55rem .8rem;border-radius:999px;white-space:nowrap}
.nav a:hover{background:var(--band)}
.nav a[aria-current="page"]{background:var(--band);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.header-cta{white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.55rem;min-height:48px;padding:.8rem 1.35rem;border-radius:999px;font-weight:600;font-size:.98rem;line-height:1.2;text-decoration:none;border:1.5px solid transparent;transition:transform .18s ease,background-color .18s ease,border-color .18s ease}
.btn:hover{transform:translateY(-1px)}
.btn-primary{background:var(--button);color:var(--button-ink)}
.btn-primary:hover{background:color-mix(in srgb,var(--button) 88%,#000)}
.btn-ghost{color:var(--dark-ink);border-color:color-mix(in srgb,var(--dark-ink) 38%,transparent)}
.btn-ghost:hover{border-color:var(--dark-ink)}
.btn-line{color:var(--ink);border-color:var(--line);background:var(--surface)}
.btn-line:hover{border-color:var(--ink)}
.btn svg{width:18px;height:18px}
.header-cta{display:inline-flex}
.menu{display:none;position:relative}
.menu>summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:.5rem;min-height:44px;padding:.5rem .95rem;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);font-weight:600;font-size:.95rem}
.menu>summary::-webkit-details-marker{display:none}
.menu>summary svg{width:18px;height:18px}
.menu[open]>summary{border-color:var(--ink)}
.menu-panel{position:absolute;right:0;top:calc(100% + 10px);width:min(86vw,340px);background:var(--surface);border:1px solid var(--line);border-radius:calc(var(--radius) + 4px);box-shadow:0 24px 60px rgba(0,0,0,.16);padding:.6rem}
.menu-panel a{display:block;padding:.85rem 1rem;border-radius:10px;color:var(--ink);text-decoration:none;font-weight:600}
.menu-panel a:hover,.menu-panel a[aria-current="page"]{background:var(--band)}
.menu-panel .btn{width:100%;margin-top:.4rem}
/* Hero */
.hero{position:relative;overflow:hidden;background:var(--dark);color:var(--dark-ink);isolation:isolate}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:${
    t.hero === "layers"
      ? "radial-gradient(70% 90% at 92% 8%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 62%),radial-gradient(60% 70% at 0% 100%,color-mix(in srgb,var(--accent) 10%,transparent),transparent 60%)"
      : "linear-gradient(transparent 0 calc(100% - 1px),color-mix(in srgb,var(--dark-ink) 7%,transparent) 0) 0 0/100% 56px,linear-gradient(90deg,transparent 0 calc(100% - 1px),color-mix(in srgb,var(--dark-ink) 7%,transparent) 0) 0 0/56px 100%,radial-gradient(80% 80% at 85% 0%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 60%)"
  }}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:clamp(2.5rem,5vw,4.5rem);align-items:center;padding-top:clamp(4rem,8vw,6.5rem);padding-bottom:clamp(4rem,8vw,6.5rem)}
.eyebrow{display:inline-flex;align-items:center;gap:.7rem;font-size:.78rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-text);margin:0 0 1.2rem}
.eyebrow::before{content:"";width:28px;height:2px;background:var(--accent)}
.on-dark .eyebrow{color:var(--dark-accent)}
.on-dark .eyebrow::before{background:var(--dark-accent)}
.hero h1{color:var(--dark-ink);max-width:19ch;font-size:clamp(2.45rem,5vw,4.25rem)}
.lede{font-size:clamp(1.08rem,1.5vw,1.26rem);line-height:1.6;color:var(--muted);max-width:60ch}
.hero .lede{color:var(--dark-muted);margin-top:1.4rem}
.credential{display:inline-flex;align-items:center;gap:.7rem;margin-top:1.6rem;padding:.55rem 1rem .55rem .65rem;border:1px solid color-mix(in srgb,var(--dark-ink) 22%,transparent);border-radius:999px;font-weight:600;font-size:.95rem;color:var(--dark-ink);background:color-mix(in srgb,var(--dark-raised) 70%,transparent)}
.credential i{display:block;width:10px;height:10px;border-radius:50%;background:var(--dark-accent);box-shadow:0 0 0 5px color-mix(in srgb,var(--dark-accent) 25%,transparent)}
.actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}
.hero-meta{display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;margin-top:1.8rem;font-size:.92rem;color:var(--dark-muted)}
.hero-meta a{color:var(--dark-ink)}
/* Hero composition: layers */
.stack{position:relative;padding:1.4rem 0 1.4rem 1.4rem}
.stack::before,.stack::after{content:"";position:absolute;inset:0 1.4rem 2.8rem 0;border:1px solid color-mix(in srgb,var(--dark-accent) 40%,transparent);border-radius:calc(var(--radius) + 6px)}
.stack::after{inset:2.8rem 0 0 2.8rem;border-color:color-mix(in srgb,var(--dark-ink) 14%,transparent)}
.stack-card{position:relative;z-index:1;background:color-mix(in srgb,var(--dark-raised) 92%,#000);border:1px solid color-mix(in srgb,var(--dark-ink) 14%,transparent);border-radius:calc(var(--radius) + 2px);padding:clamp(1.4rem,3vw,2.1rem);box-shadow:0 40px 80px rgba(0,0,0,.35)}
.stack-card h2{font-size:1.32rem;line-height:1.25;color:var(--dark-ink)}
.stack-card ol{list-style:none;margin:1.3rem 0 0;padding:0;counter-reset:s}
.stack-card li{counter-increment:s;display:grid;grid-template-columns:2.4rem 1fr;gap:.8rem;padding:.95rem 0;border-top:1px solid color-mix(in srgb,var(--dark-ink) 12%,transparent);color:var(--dark-ink);font-weight:500}
.stack-card li::before{content:counter(s,decimal-leading-zero);font-family:var(--display);color:var(--dark-accent);font-weight:600}
.stack-card li span{display:block;color:var(--dark-muted);font-weight:400;font-size:.92rem;margin-top:.15rem}
/* Hero composition: route */
.route{background:color-mix(in srgb,var(--dark-raised) 80%,transparent);border:1px solid color-mix(in srgb,var(--dark-ink) 14%,transparent);border-radius:calc(var(--radius) + 4px);padding:clamp(1.4rem,3vw,2rem)}
.route h2{font-size:.82rem;font-family:var(--body);font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--dark-muted)}
.route ol{list-style:none;margin:1.4rem 0 0;padding:0;position:relative}
.route ol::before{content:"";position:absolute;left:11px;top:14px;bottom:14px;width:2px;background:repeating-linear-gradient(var(--dark-accent) 0 8px,transparent 8px 14px)}
.route li{position:relative;display:flex;align-items:center;gap:1rem;padding:.62rem 0;color:var(--dark-ink);font-weight:600;font-size:1.05rem}
.route li::before{content:"";flex:0 0 auto;width:24px;height:24px;border-radius:50%;background:var(--dark);border:2px solid var(--dark-accent);box-shadow:0 0 0 4px var(--dark-raised)}
.route li:first-child::before,.route li:last-child::before{background:var(--dark-accent)}
.route p{margin-top:1.2rem;font-size:.9rem;color:var(--dark-muted)}
/* Page header (inner pages) */
.page-head{background:var(--dark);color:var(--dark-ink);position:relative;overflow:hidden;isolation:isolate}
.page-head::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(60% 120% at 100% 0%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 60%)}
.page-head .wrap{padding-top:clamp(3.5rem,7vw,5.5rem);padding-bottom:clamp(3rem,6vw,4.5rem)}
.page-head h1{color:var(--dark-ink);font-size:clamp(2.3rem,4.8vw,3.9rem);max-width:20ch}
.page-head .lede{color:var(--dark-muted);margin-top:1.2rem}
.crumbs{font-size:.86rem;color:var(--dark-muted);margin-bottom:1.4rem}
.crumbs a{color:var(--dark-ink)}
/* Sections */
.section{padding:var(--section) 0}
.band{background:var(--band)}
.section-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem 4rem;align-items:end;margin-bottom:clamp(2.2rem,4vw,3.4rem)}
.section-head .lede{justify-self:start}
.section-head.stacked{grid-template-columns:1fr;max-width:760px}
.grid{display:grid;gap:clamp(1rem,2vw,1.5rem)}
.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.card{position:relative;display:flex;flex-direction:column;gap:.6rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:clamp(1.4rem,2.4vw,1.9rem);transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}
.card:hover{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 18px 40px rgba(0,0,0,.06)}
.card .num{font-family:var(--display);font-weight:600;color:var(--accent-text);font-size:.95rem;letter-spacing:.06em}
.card p{color:var(--muted);font-size:.98rem}
.card-foot{margin-top:auto;padding-top:.6rem}
.icon{width:44px;height:44px;border-radius:calc(var(--radius) * .7);display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,var(--surface));color:var(--accent-text)}
.icon svg{width:22px;height:22px}
.more{margin-top:2rem}
/* Process timeline */
.timeline{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(var(--steps,4),minmax(0,1fr));gap:1.5rem;position:relative}
.timeline::before{content:"";position:absolute;left:24px;right:calc(100% / var(--steps,4) - 24px);top:24px;height:2px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 20%,var(--line)))}
.timeline li{position:relative;padding-top:4.2rem}
.timeline .step{position:absolute;top:0;left:0;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:2px solid var(--accent);font-family:var(--display);font-weight:700;color:var(--accent-text)}
.timeline h3{margin-bottom:.5rem}
.timeline p{color:var(--muted);font-size:.98rem}
/* Pillars */
.pillars{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--line)}
.pillars>div{padding:2rem 1.6rem 2rem 0;border-right:1px solid var(--line)}
.pillars>div+div{padding-left:1.6rem}
.pillars>div:last-child{border-right:0}
.pillars h3{font-size:1.55rem;margin-bottom:.7rem}
.pillars p{color:var(--muted)}
/* Chips and chain */
.chain{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.6rem}
.chain li{display:inline-flex;align-items:center;gap:.6rem;padding:.6rem 1.05rem;border-radius:999px;background:var(--surface);border:1px solid var(--line);font-weight:600}
.chain li::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent)}
/* Solutions */
.status{display:inline-flex;align-items:center;gap:.45rem;align-self:flex-start;padding:.28rem .7rem;border-radius:999px;font-size:.74rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--line);color:var(--muted);background:var(--bg)}
.status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.status-live,.status-in_use{color:#106b3b;border-color:#bfe3cc;background:#effaf3}
.status-pilot{color:var(--accent-text);border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 9%,var(--surface))}
.status-planned,.status-concept,.status-in_development{color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;margin:0 0 1.8rem;padding:0;list-style:none;font-size:.92rem;color:var(--muted)}
.legend strong{color:var(--ink)}
/* Split, contact, form */
.split{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(2rem,5vw,4.5rem);align-items:start}
.prose p+p{margin-top:1rem}
.prose .lede{color:var(--ink)}
.panel{background:var(--dark);color:var(--dark-ink);border-radius:calc(var(--radius) + 4px);padding:clamp(1.6rem,3vw,2.3rem)}
.panel h2,.panel h3{color:var(--dark-ink)}
.panel dl{margin:1.4rem 0 0;display:grid;gap:1.1rem}
.panel dt{font-size:.74rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--dark-muted)}
.panel dd{margin:.25rem 0 0;font-size:1.08rem;font-weight:600}
.panel a{color:var(--dark-ink)}
.panel .btn{margin-top:1.6rem}
.form{background:var(--surface);border:1px solid var(--line);border-radius:calc(var(--radius) + 4px);padding:clamp(1.4rem,3vw,2.2rem)}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.field{display:flex;flex-direction:column;gap:.4rem;min-width:0}
.field.full{grid-column:1/-1}
.field label{font-weight:600;font-size:.92rem}
.field input,.field textarea{width:100%;min-width:0;font:inherit;padding:.8rem .9rem;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--muted)}
.form-note{margin-top:1rem;font-size:.92rem;color:var(--muted)}
/* CTA band */
.cta{background:var(--dark);color:var(--dark-ink)}
.cta .wrap{display:grid;grid-template-columns:minmax(0,1.4fr) auto;gap:2rem;align-items:center;padding-top:clamp(3.5rem,7vw,5rem);padding-bottom:clamp(3.5rem,7vw,5rem)}
.cta h2{color:var(--dark-ink);max-width:22ch}
.cta p{color:var(--dark-muted);margin-top:.9rem;max-width:56ch}
/* Internal markers: never part of a published site */
.tbc{display:inline-block;margin-left:.45rem;vertical-align:.12em;padding:.08rem .45rem;border-radius:4px;background:var(--notice);color:var(--notice-ink);font-family:var(--body);font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.missing{display:flex;gap:.7rem;align-items:flex-start;padding:1rem 1.15rem;border-radius:var(--radius);border:1.5px dashed color-mix(in srgb,var(--notice-ink) 45%,transparent);background:var(--notice);color:var(--notice-ink);font-size:.95rem}
.missing strong{white-space:nowrap}
.on-dark .missing{border-color:color-mix(in srgb,var(--notice) 60%,transparent)}
.readiness{list-style:none;margin:1.4rem 0 0;padding:0;display:grid;gap:.7rem}
.readiness li{display:grid;grid-template-columns:22px 1fr;gap:.8rem;align-items:start}
.readiness li::before{content:"";width:18px;height:18px;margin-top:.2rem;border:2px solid var(--line);border-radius:5px}
/* Footer */
.footer{background:var(--dark);color:var(--dark-muted);font-size:.95rem;border-top:1px solid color-mix(in srgb,var(--dark-ink) 10%,transparent)}
.footer .wrap{padding-top:clamp(3rem,6vw,4.5rem);padding-bottom:2.2rem}
.foot-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:2.4rem}
.footer h2{font-family:var(--body);font-size:.76rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--dark-ink);margin-bottom:1rem}
.footer ul{list-style:none;margin:0;padding:0;display:grid;gap:.55rem}
.footer a{color:var(--dark-ink);text-decoration:none}
.footer a:hover{text-decoration:underline}
.footer .brand-name{color:var(--dark-ink)}
.foot-base{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;margin-top:3rem;padding-top:1.6rem;border-top:1px solid color-mix(in srgb,var(--dark-ink) 12%,transparent);font-size:.86rem}
/* Responsive */
@media (max-width:1040px){.cols-4,.pillars{grid-template-columns:repeat(2,minmax(0,1fr))}.pillars>div:nth-child(2){border-right:0}.pillars>div:nth-child(3){padding-left:0}.foot-grid{grid-template-columns:1fr 1fr}}
@media (max-width:920px){.nav,.header-cta{display:none}.menu{display:block}.hero-grid,.split,.section-head,.cta .wrap{grid-template-columns:1fr}.cols-3{grid-template-columns:repeat(2,minmax(0,1fr))}.timeline{grid-template-columns:1fr;gap:0}.timeline::before{left:24px;right:auto;top:24px;bottom:24px;width:2px;height:auto;background:linear-gradient(var(--accent),color-mix(in srgb,var(--accent) 20%,var(--line)))}.timeline li{padding:0 0 2rem 4.4rem;min-height:50px}.timeline li:last-child{padding-bottom:0}}
@media (max-width:640px){body{font-size:1rem}.cols-3,.cols-2,.cols-4,.pillars,.form-grid,.foot-grid{grid-template-columns:1fr}.pillars>div,.pillars>div+div{padding:1.6rem 0;border-right:0;border-bottom:1px solid var(--line)}.bar{min-height:66px;gap:.8rem}.brand-name small{display:none}.actions .btn{width:100%}.stack{padding:.9rem 0 .9rem .9rem}.stack::before{inset:0 .9rem 1.8rem 0}.stack::after{inset:1.8rem 0 0 1.8rem}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}.btn:hover{transform:none}}
@media (forced-colors:active){.btn,.status,.tbc,.missing{border:1px solid CanvasText}}
@media print{.site-header,.menu,.draft{position:static}.hero,.page-head,.cta,.footer,.panel{background:#fff;color:#000}}
`;
}
