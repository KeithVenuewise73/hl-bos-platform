// HLVS PORTAL LOADER (v5)
//
// CHANGE FROM v4: the opportunity list is now SERVER-SIDE paginated.
// v4 called hlvs_board(), which aggregated every row into one JSON array and
// filtered client-side - that breaks at 12,200 records. v5 calls
// hlvs_board_page() (limit/offset + filters + sort, computed in Postgres) and
// hlvs_board_facets() for dropdown values. Nothing else in the portal changed:
// detail view, CEO decision flow and build-package generation are untouched.
//
// Default view is ALL OPPORTUNITIES. No pre-filter, no Top-N, no score gate.

const SUPABASE_URL = "https://mvvtngiopdrgiedjmhfb.supabase.co";
const ANON = "<REDACTED:jwt:e5e9a7d81b49>";
const BUCKET = "hlvs-portal";
const OBJECT = "index.html";
const OBJ_API = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + OBJECT;
const PUBLIC_URL = SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + OBJECT;

const HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>HLVS — Opportunity Discovery Engine</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f1f5f9;color:#0f172a}
.serif{font-family:"Iowan Old Style",Palatino,Georgia,serif}
.wrap{max-width:1100px;margin:0 auto;padding:16px}
.card{background:#fff;border:1px solid #cbd5e1;border-radius:8px}
.hd{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #cbd5e1}
.hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px}
nav{display:flex;gap:4px;overflow-x:auto;padding:0 8px 6px}
nav button{border:0;background:none;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:500;color:#475569;cursor:pointer;white-space:nowrap}
nav button.on{background:#0f172a;color:#fff}
nav .pend{background:#e2e8f0;color:#475569;font-size:9px;text-transform:uppercase;padding:1px 4px;border-radius:3px;margin-left:4px}
.row{display:block;width:100%;text-align:left;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:14px 16px;margin-bottom:8px;cursor:pointer;font:inherit}
.row:hover{border-color:#64748b}
.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tag{font-size:10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:4px;padding:1px 6px;color:#475569}
.pat{font-size:10px;border-radius:4px;padding:1px 6px;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3}
.arch{font-size:10px;border-radius:4px;padding:1px 6px;border:1px solid #fecdd3;background:#fff1f2;color:#9f1239}
.ek{font-size:10px;border-radius:4px;padding:1px 6px;border:1px solid}
.qcf{background:#0f172a;color:#fff;font-size:10px;border-radius:4px;padding:1px 6px}
.score{width:112px;text-align:right;flex-shrink:0}
.big{font:600 24px/1 ui-monospace,monospace}
.sub{font:11px ui-monospace,monospace;color:#64748b;margin-top:2px}
.pen{color:#be123c}
.meta{display:flex;flex-wrap:wrap;gap:6px 12px;border-top:1px solid #f1f5f9;margin-top:10px;padding-top:8px;font-size:12px;color:#475569}
.mag{border:1px solid #e2e8f0;background:#f8fafc;border-radius:4px;padding:1px 6px;font-size:12px}
.mag.g{border-color:#99f6e4;background:#f0fdfa;color:#115e59}
section{border-top:1px solid #e2e8f0;margin-top:20px;padding-top:16px}
h3.s{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:8px;font-weight:600}
.ev{border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:8px}
.ag{border:1px solid #fecdd3;background:#fff1f2;border-radius:6px;padding:10px;margin-bottom:6px}
.pv{font-size:10px;text-transform:uppercase;border-radius:4px;padding:1px 6px;border:1px solid;font-weight:500}
.pv.verified_fact{background:#ccfbf1;color:#134e4a;border-color:#5eead4}
.pv.external_claim{background:#e0f2fe;color:#0c4a6e;border-color:#7dd3fc}
.pv.estimate{background:#fef3c7;color:#78350f;border-color:#fcd34d}
.pv.inference{background:#ede9fe;color:#4c1d95;border-color:#c4b5fd}
.pv.ceo_note{background:#f1f5f9;color:#334155;border-color:#cbd5e1}
.mode{background:#fecdd3;color:#881337;font:10px ui-monospace,monospace;text-transform:uppercase;padding:1px 6px;border-radius:4px}
.bar{height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;flex:1}
.bar>i{display:block;height:100%;background:#334155}
.fx{display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:4px}
.fx span:first-child{width:170px;flex-shrink:0;color:#475569}
.fx span:last-child{width:48px;text-align:right;font-family:ui-monospace,monospace;color:#64748b}
button.b{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer}
button.b:hover{background:#f8fafc}
button.b.on{background:#0f172a;color:#fff;border-color:#0f172a}
button.b:disabled{opacity:.4;cursor:default}
button.p{background:#0f172a;color:#fff;border:0;border-radius:6px;padding:8px 16px;font-size:14px;font-weight:500;cursor:pointer}
input{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;font:inherit;margin-bottom:12px}
input:focus{outline:0;border-color:#0f172a;box-shadow:0 0 0 1px #0f172a}
label{display:block;font-size:12px;font-weight:500;margin-bottom:4px}
pre{background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:12px;font-size:11px;white-space:pre-wrap;max-height:420px;overflow:auto}
table{width:100%;font-size:14px;border-collapse:collapse}
th{text-align:left;font-size:11px;color:#64748b;font-weight:500;padding:4px 0;border-bottom:1px solid #e2e8f0}
td{padding:4px 0;border-bottom:1px solid #f1f5f9;font-family:ui-monospace,monospace}
.note{border:1px solid #fcd34d;background:#fffbeb;color:#78350f;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:16px}
.ok{border:1px solid #5eead4;background:#f0fdfa;color:#115e59;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:16px}
.err{border:1px solid #fda4af;background:#fff1f2;color:#9f1239;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:12px}
a{color:#0369a1;font-size:12px;word-break:break-all}
.center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.muted{color:#64748b;font-size:12px}
.dash{border:1px dashed #94a3b8;border-radius:8px;background:#fff;padding:40px;text-align:center}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:12px}
.ctl .f{display:flex;flex-direction:column;gap:2px}
.ctl label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin:0}
select{border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:12px;background:#fff;max-width:200px}
.sbox{border:1px solid #cbd5e1;border-radius:6px;padding:5px 8px;font-size:12px;width:200px;margin:0}
.counts{font:12px ui-monospace,monospace;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;margin-bottom:10px;display:flex;gap:16px;flex-wrap:wrap}
.pg{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:12px 0}
</style></head><body>
<div id="app"></div>
<script type="module">
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient("${SUPABASE_URL}", "${ANON}");
const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const EK = {price_disruption:["Price disruption","#fff1f2","#9f1239","#fecdd3"],product_disruption:["Product disruption","#fff7ed","#9a3412","#fed7aa"],customer_pain:["Customer pain","#fffbeb","#92400e","#fde68a"],market_gap:["Market gap","#eef2ff","#3730a3","#c7d2fe"],business_disruption:["Business disruption","#f8fafc","#334155","#cbd5e1"]};
const FX = [["market_demand","Market Demand",20],["monetization","Monetization",15],["competitive_weakness","Competitive Weakness",15],["build_simplicity","Build Simplicity",15],["acquisition","Acquisition Accessibility",15],["recurring_revenue","Recurring Revenue",10],["low_touch","Low-Touch Operation",5],["strategic_reuse","Strategic Reuse",5]];
const SORTS = [["discovered_desc","Newest discovered"],["stars_desc","Stars high to low"],["stars_asc","Stars low to high"],["issues_desc","Most open issues"],["pushed_desc","Most recently pushed"],["category_asc","Category"],["score_desc","Opportunity score"]];

let S = {view:"opportunities", page:null, facets:null, detail:null, out:null, err:"", loading:false,
  q:{limit:50, offset:0, category:"", pattern:"", source:"", archived:"all", license:"", language:"", search:"", sort:"discovered_desc"}};

const ekTag = k => { const e = EK[k]||EK.business_disruption; return '<span class="ek" style="background:'+e[1]+';color:'+e[2]+';border-color:'+e[3]+'">'+e[0]+'</span>'; };
const mag = v => '<span class="mag'+((v=="low"||v=="very_low"||v=="high"||v=="very_high")?" g":"")+'">'+esc(String(v||"unknown").replace(/_/g," "))+'</span>';
const arr = v => v ? [v] : null;

async function login(e,p){ S.err=""; const {error} = await sb.auth.signInWithPassword({email:e,password:p}); if(error){S.err=error.message; render();} else { await boot(); } }

async function loadFacets(){ const {data,error} = await sb.rpc("hlvs_board_facets"); if(!error) S.facets = data; }

async function loadPage(){
  S.loading = true;
  const q = S.q;
  const {data,error} = await sb.rpc("hlvs_board_page",{
    p_limit:q.limit, p_offset:q.offset,
    p_category:arr(q.category), p_pattern:arr(q.pattern), p_source:arr(q.source),
    p_archived:q.archived, p_license:arr(q.license), p_language:arr(q.language),
    p_search:q.search||null, p_sort:q.sort});
  S.loading = false;
  if(error){ S.err = error.message; } else { S.page = data; S.err=""; }
  S.view="opportunities"; S.detail=null; render();
}

async function boot(){ await loadFacets(); await loadPage(); }
async function openOpp(id){ const {data,error} = await sb.rpc("hlvs_opportunity",{p_id:id}); if(error){S.err=error.message;} else {S.detail=data; S.out=null;} render(); }
async function decide(id,d){ S.err=""; const {error} = await sb.rpc("hlvs_decide",{p_id:id,p_decision:d,p_rationale:"Recorded from HLVS portal"}); if(error){S.err=error.message;} await openOpp(id); }
async function pkg(id){ const {data,error} = await sb.rpc("hlvs_build_package",{p_id:id}); if(error){S.err=error.message;} else {S.out=data;} render(); }

function loginView(){
  app.innerHTML = '<div class="center"><div style="width:100%;max-width:360px">'+
  (S.err?'<div class="err">'+esc(S.err)+'</div>':'')+
  '<div class="card" style="padding:32px">'+
  '<h1 class="serif" style="font-size:30px">HLVS</h1>'+
  '<p style="font-weight:500;margin-top:4px">Herman Legacy Software Ventures</p>'+
  '<p class="muted" style="margin-bottom:24px">Opportunity Discovery Engine</p>'+
  '<label for="em">Email</label><input id="em" type="email" autocomplete="username">'+
  '<label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password">'+
  '<button class="p" id="go" style="width:100%">Sign In</button>'+
  '<p class="muted" style="margin-top:20px">Private administrative system. Authorised personnel only.</p>'+
  '</div></div></div>';
  const go=()=>login(document.getElementById("em").value,document.getElementById("pw").value);
  document.getElementById("go").onclick=go;
  document.getElementById("pw").onkeydown=e=>{if(e.key==="Enter")go();};
}

function shell(inner){
  const tot = S.page ? S.page.total : 0;
  const nav=[["opportunities","Opportunities",1],["discover","Discover",0],["research","Research",1],["builds","Builds",0],["portfolio","Portfolio",0],["sources","Sources",1],["admin","Admin",0]];
  app.innerHTML='<div class="hd"><div class="hdr"><div style="display:flex;gap:12px;align-items:center">'+
  '<span class="serif" style="font-size:18px">HLVS</span>'+
  '<span class="muted">'+tot.toLocaleString()+' live records · HL-BOS Core</span></div>'+
  '<button class="b" id="out">Sign out</button></div><nav>'+
  nav.map(([k,l,r])=>'<button data-v="'+k+'" class="'+(S.view===k?"on":"")+'">'+l+(r?"":'<span class="pend">Pending</span>')+'</button>').join("")+
  '</nav></div><div class="wrap">'+(S.err?'<div class="err">'+esc(S.err)+'</div>':'')+inner+'</div>';
  document.getElementById("out").onclick=async()=>{await sb.auth.signOut();S={view:"opportunities",page:null,facets:null,detail:null,out:null,err:"",loading:false,q:{limit:50,offset:0,category:"",pattern:"",source:"",archived:"all",license:"",language:"",search:"",sort:"discovered_desc"}};render();};
  app.querySelectorAll("nav button[data-v]").forEach(b=>b.onclick=()=>{S.view=b.dataset.v;S.detail=null;S.out=null;render();});
}

function sel(id,label,val,opts,withCounts){
  return '<div class="f"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+
    opts.map(o=>{const v=o.v!==undefined?o.v:o[0]; const t=o.v!==undefined?(o.v+(withCounts&&o.n?" ("+o.n.toLocaleString()+")":"")):o[1];
      return '<option value="'+esc(v)+'"'+(String(val)===String(v)?" selected":"")+'>'+esc(t)+'</option>';}).join("")+
    '</select></div>';
}

function boardView(){
  const p = S.page, f = S.facets || {};
  if(!p) return '<div class="dash"><p class="muted">Loading…</p></div>';
  const q = S.q;
  const blank = [{v:"",n:0}];
  const cats = blank.concat(f.categories||[]);
  const pats = blank.concat(f.patterns||[]);
  const srcs = blank.concat(f.sources||[]);
  const lics = blank.concat(f.licenses||[]);
  const langs= blank.concat(f.languages||[]);
  const pages = Math.max(1, Math.ceil(p.filtered / p.limit));
  const cur = Math.floor(p.offset / p.limit) + 1;
  const from = p.filtered ? p.offset+1 : 0;
  const to = Math.min(p.offset + p.limit, p.filtered);

  return '<div style="margin-bottom:12px"><h2 class="serif" style="font-size:24px">Opportunity Dashboard</h2>'+
  '<p class="muted">All opportunities. Filters are navigation only — nothing is removed from the database.</p></div>'+
  '<div class="ctl">'+
    sel("f-cat","Category",q.category,cats,true)+
    sel("f-pat","Pattern",q.pattern,pats,true)+
    sel("f-src","Source",q.source,srcs,true)+
    sel("f-arch","Archived",q.archived,[["all","All"],["active","Active"],["archived","Archived"]])+
    sel("f-lic","License",q.license,lics,true)+
    sel("f-lang","Language",q.language,langs,true)+
    sel("f-sort","Sort",q.sort,SORTS)+
    sel("f-lim","Per page",q.limit,[["50","50"],["100","100"],["250","250"]])+
    '<div class="f"><label for="f-q">Search</label><input class="sbox" id="f-q" placeholder="name or description" value="'+esc(q.search)+'"></div>'+
    '<button class="b" id="f-go">Apply</button><button class="b" id="f-clr">Clear</button>'+
  '</div>'+
  '<div class="counts"><span>TOTAL RESULTS: '+p.total.toLocaleString()+'</span>'+
  '<span>SHOWING: '+p.filtered.toLocaleString()+' of '+p.total.toLocaleString()+'</span>'+
  '<span>Page '+cur+' of '+pages.toLocaleString()+' · rows '+from.toLocaleString()+'–'+to.toLocaleString()+'</span></div>'+
  (p.rows.length===0 ? '<div class="dash"><p class="muted">No opportunities match these filters. Nothing has been deleted — clear the filters to see all '+p.total.toLocaleString()+'.</p></div>' :
  p.rows.map(r=>'<button class="row" data-id="'+r.id+'"><div class="top"><div style="flex:1;min-width:0">'+
  '<div class="tags"><strong>'+esc(r.title)+'</strong>'+
  (r.category?'<span class="tag">'+esc(r.category)+'</span>':'')+
  (r.pattern?'<span class="pat">'+esc(r.pattern)+'</span>':'')+
  (r.source?'<span class="tag">'+esc(r.source)+'</span>':'')+
  (r.archived?'<span class="arch">Archived</span>':'')+'</div>'+
  '<p style="margin-top:4px;color:#475569">'+esc(String(r.summary||"").slice(0,160))+'</p>'+
  '</div><div class="score"><div class="big">'+(r.net===null||r.net===undefined?'—':r.net)+
  (r.net===null||r.net===undefined?'':'<span style="font-size:12px;color:#94a3b8">/100</span>')+'</div>'+
  '<div class="sub">'+esc(r.confidence||"unscored")+'</div>'+
  '<div class="sub">'+r.ef+' for / '+r.ea+' against</div></div></div>'+
  '<div class="meta"><span>★ '+(r.stars??0).toLocaleString()+'</span><span>⑂ '+(r.forks??0).toLocaleString()+'</span>'+
  '<span>'+(r.issues??0).toLocaleString()+' issues</span>'+
  (r.language?'<span>'+esc(r.language)+'</span>':'')+
  (r.license?'<span>'+esc(r.license)+'</span>':'')+
  (r.pushed_at?'<span class="muted">pushed '+esc(r.pushed_at)+'</span>':'')+
  '<span style="margin-left:auto;font-weight:500">Open ›</span></div></button>').join(""))+
  '<div class="pg"><button class="b" id="pg-first"'+(p.offset<=0?" disabled":"")+'>« First</button>'+
  '<button class="b" id="pg-prev"'+(p.offset<=0?" disabled":"")+'>‹ Previous</button>'+
  '<span class="muted">Page '+cur+' of '+pages.toLocaleString()+'</span>'+
  '<button class="b" id="pg-next"'+(p.offset+p.limit>=p.filtered?" disabled":"")+'>Next ›</button>'+
  '<button class="b" id="pg-last"'+(p.offset+p.limit>=p.filtered?" disabled":"")+'>Last »</button></div>';
}

function detailView(){
  const d=S.detail, fx=d.factors||{};
  return '<button class="b" id="back" style="margin-bottom:12px">← Back</button><div class="card" style="padding:20px">'+
  '<h2 class="serif" style="font-size:24px">'+esc(d.title)+'</h2>'+
  '<div class="tags" style="margin-top:6px">'+ekTag(d.event_kind)+'<span class="muted">'+esc(d.category)+'</span></div>'+
  '<section><h3 class="s">Why it exists</h3><p>'+esc(d.trigger)+'</p></section>'+
  '<section><h3 class="s">Problem</h3><p>'+esc(d.problem)+'</p></section>'+
  '<section><h3 class="s">Target customer</h3><p>'+esc(d.customer)+'</p></section>'+
  '<section><h3 class="s">Opportunity score</h3>'+
  '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px"><div style="font:600 30px/1 ui-monospace,monospace">'+d.net+'<span style="font-size:14px;color:#94a3b8">/100</span></div>'+
  '<div class="sub">'+d.gross+' gross <span class="pen">− '+d.penalty+' counter-evidence</span> = '+d.net+' net</div></div>'+
  FX.map(([k,l,w])=>{const a=Number(fx[k]??0);return '<div class="fx"><span>'+l+'</span><div class="bar"><i style="width:'+(a/w*100)+'%"></i></div><span>'+a+'/'+w+'</span></div>';}).join("")+
  '</section>'+
  '<section><h3 class="s">▲ Evidence for ('+d.evidence_for.length+')</h3>'+
  d.evidence_for.map(e=>'<div class="ev"><div class="tags"><span class="pv '+esc(e.type)+'">'+esc(String(e.type).replace(/_/g," "))+'</span><span class="muted">'+esc(e.source)+'</span></div>'+
  '<p style="margin-top:4px">'+esc(e.title)+'</p>'+(e.url?'<a href="'+esc(e.url)+'" target="_blank" rel="noreferrer">'+esc(e.url)+'</a>':'')+'</div>').join("")+'</section>'+
  '<section><h3 class="s">▼ Evidence against ('+d.evidence_against.length+')</h3>'+
  d.evidence_against.map(a=>'<div class="ag"><div class="tags"><span class="mode">'+esc(a.mode)+'</span><span style="font:10px ui-monospace,monospace;color:#be123c">severity '+a.severity+'/10</span></div>'+
  '<p style="margin-top:4px;color:#4c0519">'+esc(a.statement)+'</p></div>').join("")+
  '<p class="sub">Penalty −'+d.penalty+' (sum of severities, capped at 25)</p></section>'+
  '<section><h3 class="s">Competitors</h3><div class="tags">'+(d.competitors||[]).map(c=>'<span class="tag">'+esc(c)+'</span>').join("")+'</div></section>'+
  '<section><h3 class="s">Product gap</h3><p>'+esc(d.gap)+'</p></section>'+
  '<section><h3 class="s">Economic scenarios</h3><table><tr><th>Customers</th><th>MRR</th><th>ARR</th></tr>'+
  [100,500,1000,5000].map(n=>{const one=d.price_model==="one_time";const m=one?0:Number(d.price_low)*n;return '<tr><td>'+n.toLocaleString()+'</td><td>'+(m?"$"+m.toLocaleString():"—")+'</td><td>$'+((one?Number(d.price_low)*n:m*12)).toLocaleString()+'</td></tr>';}).join("")+
  '</table><div class="note" style="margin-top:8px"><strong>Scenarios, not forecasts.</strong> Arithmetic on the listed price. No claim these counts are achievable.</div></section>'+
  '<section><h3 class="s">Acquisition</h3><p>'+esc((d.channels||[]).join(" · "))+'</p></section>'+
  '<section><h3 class="s">Risks</h3><ul style="padding-left:18px">'+(d.risks||[]).map(r=>'<li>'+esc(r)+'</li>').join("")+'</ul></section>'+
  '<section><h3 class="s">Why HLVS ranked it here</h3><p>'+esc(d.rationale)+'</p></section>'+
  '<section><h3 class="s">CEO decision'+(d.decision?' — recorded: '+esc(d.decision):'')+'</h3>'+
  '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
  [["watch","Watch"],["build","Approve for MVP"],["defer","Research more"],["ignore","Reject"]].map(([v,l])=>'<button class="b '+(d.decision===v?"on":"")+'" data-dec="'+v+'">'+l+'</button>').join("")+'</div>'+
  '<p class="muted" style="margin-top:8px">Writes through vstudio.record_decision, gated by vstudio.decision.create — platform_owner only.</p>'+
  '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="b" id="spec">GENERATE BUILD SPEC</button>'+
  '<button class="b" id="prompt">GENERATE BUILDER PROMPT</button></div>'+
  (S.out?'<div style="margin-top:12px"><button class="b" id="cp" style="margin-bottom:6px">Copy</button><pre id="pre">'+esc(S.out)+'</pre></div>':'')+
  '</section></div>';
}

function render(){
  sb.auth.getSession().then(({data})=>{
    if(!data.session){ loginView(); return; }
    let inner="";
    if(S.detail) inner=detailView();
    else if(S.view==="opportunities") inner=boardView();
    else if(S.view==="research"){
      inner='<h2 class="serif" style="font-size:24px">Research</h2><div class="dash" style="margin-top:12px">'+
      '<p><strong>Research grouping is not available at this dataset size.</strong></p>'+
      '<p class="muted" style="margin-top:8px">This view grouped the full record set in memory, which is no longer safe now that the corpus exceeds ten thousand records. Use the Opportunities list with the Pattern and Category filters instead — it does the same grouping server-side.</p></div>';
    }
    else if(S.view==="sources") inner='<h2 class="serif" style="font-size:24px">Sources</h2><p class="muted" style="margin-bottom:12px">Collector status. One unavailable source never blocks a run.</p>'+
      [["Web event research","Working","Primary collector. Produced most of this evidence."],["GitHub API","Deployed, no credential","GITHUB_TOKEN not set — runs unauthenticated at 10 searches/minute."],["Hacker News (Algolia)","Deployed, working","No auth. Collector verifies echoed params to reject stale cache."],["Apple iTunes Search","Probes at runtime","Reports honestly. Never fabricates downloads or revenue."],["Apple review RSS","Unresolved","Blocks consumer review mining."],["Product Hunt","Deployed, no credential","Free developer token required."],["Reddit / Play / G2","Excluded","Paid agreement or terms prohibit automated collection."]]
      .map(([n,s,d])=>'<div class="card" style="padding:12px;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;align-items:center"><span class="tag">'+esc(s)+'</span><strong>'+esc(n)+'</strong><span class="muted" style="flex:1">'+esc(d)+'</span></div>').join("");
    else if(S.view==="discover") inner='<h2 class="serif" style="font-size:24px">Discover</h2><div class="dash" style="margin-top:12px"><p><strong>RUN DISCOVERY unavailable in this preview.</strong></p><p class="muted" style="margin-top:8px">The discovery-run function is deployed and live, but browser invocation is not yet wired securely.</p></div>';
    else inner='<div class="dash"><h2 class="serif" style="font-size:24px;text-transform:capitalize">'+S.view+'</h2><p class="muted" style="margin-top:8px">Not built. No backend capability yet, and nothing here is simulated.</p></div>';
    shell(inner);

    const g=id=>document.getElementById(id);
    const apply=()=>{
      const q=S.q;
      if(g("f-cat")) q.category=g("f-cat").value;
      if(g("f-pat")) q.pattern=g("f-pat").value;
      if(g("f-src")) q.source=g("f-src").value;
      if(g("f-arch")) q.archived=g("f-arch").value;
      if(g("f-lic")) q.license=g("f-lic").value;
      if(g("f-lang")) q.language=g("f-lang").value;
      if(g("f-sort")) q.sort=g("f-sort").value;
      if(g("f-lim")) q.limit=parseInt(g("f-lim").value,10)||50;
      if(g("f-q")) q.search=g("f-q").value;
      q.offset=0; loadPage();
    };
    if(g("f-go")) g("f-go").onclick=apply;
    if(g("f-q")) g("f-q").onkeydown=e=>{if(e.key==="Enter")apply();};
    ["f-cat","f-pat","f-src","f-arch","f-lic","f-lang","f-sort","f-lim"].forEach(id=>{ if(g(id)) g(id).onchange=apply; });
    if(g("f-clr")) g("f-clr").onclick=()=>{ S.q={limit:50,offset:0,category:"",pattern:"",source:"",archived:"all",license:"",language:"",search:"",sort:"discovered_desc"}; loadPage(); };

    const p=S.page;
    if(p){
      if(g("pg-first")) g("pg-first").onclick=()=>{S.q.offset=0;loadPage();};
      if(g("pg-prev"))  g("pg-prev").onclick =()=>{S.q.offset=Math.max(0,p.offset-p.limit);loadPage();};
      if(g("pg-next"))  g("pg-next").onclick =()=>{S.q.offset=p.offset+p.limit;loadPage();};
      if(g("pg-last"))  g("pg-last").onclick =()=>{S.q.offset=Math.max(0,(Math.ceil(p.filtered/p.limit)-1)*p.limit);loadPage();};
    }

    app.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>openOpp(b.dataset.id));
    const bk=g("back"); if(bk) bk.onclick=()=>{S.detail=null;S.out=null;render();};
    app.querySelectorAll("[data-dec]").forEach(b=>b.onclick=()=>decide(S.detail.id,b.dataset.dec));
    const sp=g("spec"); if(sp) sp.onclick=()=>pkg(S.detail.id);
    const pr=g("prompt"); if(pr) pr.onclick=()=>pkg(S.detail.id);
    const cp=g("cp"); if(cp) cp.onclick=()=>navigator.clipboard.writeText(S.out);
  });
}

sb.auth.getSession().then(({data})=>{ if(data.session) boot(); else render(); });
</script></body></html>`;

type Attempt = { method: string; status: number | string; body: string };

async function publish(): Promise<{ ok: boolean; key_present: boolean; attempts: Attempt[] }> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const attempts: Attempt[] = [];
  if (!key) return { ok: false, key_present: false, attempts };

  const hdrs = {
    Authorization: "Bearer " + key,
    apikey: key,
    "Content-Type": "text/html",
    "x-upsert": "true",
    "cache-control": "max-age=60",
  };

  for (const method of ["POST", "PUT"]) {
    try {
      const r = await fetch(OBJ_API, { method, headers: hdrs, body: HTML });
      const body = (await r.text()).slice(0, 300);
      attempts.push({ method, status: r.status, body });
      if (r.ok) return { ok: true, key_present: true, attempts };
    } catch (e) {
      attempts.push({ method, status: "threw", body: String(e).slice(0, 300) });
    }
  }
  return { ok: false, key_present: true, attempts };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const result = await publish();

  if (url.searchParams.has("diag")) {
    let storage: Record<string, string> = {};
    try {
      const h = await fetch(PUBLIC_URL, { method: "GET" });
      storage = {
        status: String(h.status),
        content_type: h.headers.get("content-type") ?? "(none)",
        bytes: String((await h.text()).length),
      };
    } catch (e) { storage = { error: String(e) }; }

    return new Response(JSON.stringify({
      published: result.ok,
      service_role_key_present: result.key_present,
      upload_attempts: result.attempts,
      portal_url: PUBLIC_URL,
      storage_response: storage,
    }, null, 2), { headers: { "content-type": "application/json" } });
  }

  if (result.ok) return Response.redirect(PUBLIC_URL, 302);

  return new Response(JSON.stringify({
    error: "Portal document could not be published to Storage.",
    service_role_key_present: result.key_present,
    upload_attempts: result.attempts,
    next: "Open this same URL with ?diag appended and send the output.",
  }, null, 2), { status: 503, headers: { "content-type": "application/json" } });
});
