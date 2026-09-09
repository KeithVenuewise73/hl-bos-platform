// End-to-end proof of the Shop Transformation Analysis Tool.
//
// Real schema, real SQL functions, real constraints -- the same migrations that
// are now applied to production. Only the NETWORK is faked, because this
// container cannot reach shop websites; the page bodies are the local fixtures.
import pg from "pg";
import { readFileSync } from "node:fs";
import {
  analyseShop,
  type AuditStore,
  type AuditNetwork,
} from "../../supabase/functions/_shared/transform_audit/run.ts";
import {
  GOOD_BARBER_HTML,
  BARE_BARBER_HTML,
  GLOSSGENIUS_HOSTED_HTML,
  NO_BOOKING_HTTP_HTML,
} from "../../supabase/functions/tests/fixtures/barbershops.ts";

const c = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});
await c.connect();

// --- Build a world: the HLD agency tenant, an owner, and a campaign ---------
const fixtures = readFileSync("/tmp/pgtest/tests/_fixtures.sql.inc", "utf8");
await c.query(fixtures);
await c.query("select tests.seed()");
const HLD = (await c.query("select tests.uid('tenant_a') u")).rows[0].u;
await c.query(`select set_config('request.jwt.claims',
  json_build_object('sub', tests.uid('owner_a')::text, 'role','authenticated')::text, false)`);
await c.query("set role authenticated");

const campaign = (
  await c.query(
    `select transform_audit.upsert_campaign($1,'wny_barbers_50',
     'WNY 50 barbershop prospect list','{"website":100}'::jsonb) id`,
    [HLD],
  )
).rows[0].id;

// --- Four shops, shaped like the real list ---------------------------------
const SHOPS = [
  {
    name: "Elmwood Barber Co.",
    url: "https://elmwoodbarber.example/",
    city: "Buffalo",
    html: GOOD_BARBER_HTML,
  },
  {
    name: "Northtown Fades",
    url: "https://northtownfades.glossgenius.com/",
    city: "Tonawanda",
    html: GLOSSGENIUS_HOSTED_HTML,
  },
  {
    name: "Cuts",
    url: "https://cuts.example/",
    city: "Buffalo",
    html: BARE_BARBER_HTML,
  },
  {
    name: "Southside Barber Shop",
    url: "http://southside.example/",
    city: "Buffalo",
    html: NO_BOOKING_HTTP_HTML,
  },
  { name: "Queen City Clippers", url: null, city: "Buffalo", html: null },
  {
    name: "Riverside Barbers",
    url: "https://riverside-down.example/",
    city: "Buffalo",
    html: "DOWN",
  },
];

// runScan normalizes before fetching (bare trailing slash trimmed), so key on
// both forms rather than assuming which one arrives.
const byUrl = new Map<string, string | null>();
for (const s of SHOPS) {
  if (!s.url) continue;
  byUrl.set(s.url, s.html);
  byUrl.set(s.url.replace(/\/$/, ""), s.html);
}

const net: AuditNetwork = {
  resolve: async () => ["93.184.216.34"],
  fetchPage: async (url: string) => {
    const html = byUrl.get(url) ?? byUrl.get(url.replace(/\/$/, "")) ?? null;
    if (html === null || html === "DOWN") throw new Error("ECONNREFUSED");
    return {
      status: 200,
      finalUrl: url,
      redirectChain: [],
      headers: { "content-type": "text/html" },
      body: html,
      bytes: html.length,
      contentType: "text/html",
    };
  },
};

const store = (prospectId: string): AuditStore => ({
  startRun: async () =>
    (
      await c.query("select transform_audit.start_run($1,$2) id", [
        campaign,
        prospectId,
      ])
    ).rows[0].id,
  recordFinding: async (run, f) =>
    (
      await c.query(
        `select transform_audit.record_finding($1,$2::transform_audit.dimension,$3,$4,
       $5::transform_audit.confidence,$6::transform_audit.severity,$7,$8::jsonb,$9) id`,
        [
          run,
          f.dimension,
          f.code,
          f.statement,
          f.confidence,
          f.severity,
          f.evidenceUrl,
          JSON.stringify(f.observed),
          f.detector,
        ],
      )
    ).rows[0].id,
  recordDimension: async (run, d) => {
    await c.query(
      `select transform_audit.record_dimension($1,$2::transform_audit.dimension,$3,
       $4::transform_audit.confidence,$5,$6)`,
      [run, d.dimension, d.score, d.confidence, d.rubricVersion, d.note],
    );
  },
  addRecommendation: async (run, r) =>
    (
      await c.query(
        `select transform_audit.add_recommendation($1,$2::transform_audit.priority,$3,$4,$5,$6,$7) id`,
        [
          run,
          r.priority,
          r.title,
          r.detail,
          r.capabilityKey,
          r.addressesFindingId,
          r.rank,
        ],
      )
    ).rows[0].id,
  setOutreachHook: async (run, fid, hook) => {
    await c.query("select transform_audit.set_outreach_hook($1,$2,$3)", [
      run,
      fid,
      hook,
    ]);
  },
  finishRun: async (run) =>
    (await c.query("select transform_audit.finish_run($1) s", [run])).rows[0].s,
});

// --- Import + analyse ------------------------------------------------------
const outcomes: any[] = [];
for (const [i, s] of SHOPS.entries()) {
  const pid = (
    await c.query("select transform_audit.import_shop($1,$2::jsonb) id", [
      HLD,
      JSON.stringify({
        business_name: s.name,
        locality: s.city,
        region: "NY",
        postal_code: "1420" + i,
        website_url: s.url,
        source_file: "WNY_50_Barber_HLD_Prospect_List.xlsx",
        source_row: i + 2,
      }),
    ])
  ).rows[0].id;
  const o = await analyseShop(
    { prospectId: pid, businessName: s.name, websiteUrl: s.url, locality: s.city },
    store(pid),
    net,
  );
  outcomes.push({ shop: s.name, ...o });
}

// --- The portfolio view ----------------------------------------------------
console.log("\n=== PORTFOLIO: every shop, worst first ===\n");
console.log(
  "shop".padEnd(24),
  "score".padStart(6),
  "conf".padStart(9),
  "status".padStart(20),
  " recommends",
);
for (const o of [...outcomes].sort(
  (a, b) => (a.websiteScore ?? -1) - (b.websiteScore ?? -1),
)) {
  console.log(
    o.shop.padEnd(24),
    String(o.websiteScore ?? "—").padStart(6),
    o.confidence.padStart(9),
    o.status.padStart(20),
    " " + (o.recommendedCapabilities.join(", ") || "—"),
  );
}

// --- One full report, straight out of the database -------------------------
const worst = outcomes.find((o) => o.shop === "Cuts")!;
const rep = (await c.query("select transform_audit.report($1) r", [worst.runId]))
  .rows[0].r;
console.log("\n=== FULL ANALYSIS: " + rep.shop.business_name + " ===");
console.log(
  "composite:",
  rep.composite_score,
  " coverage:",
  JSON.stringify(rep.coverage),
  " status:",
  rep.status,
);
console.log("\nAREAS FOR IMPROVEMENT (what we found):");
for (const f of rep.findings.filter((f: any) => f.severity !== "info"))
  console.log(`  [${f.severity.padEnd(8)}] ${f.statement}`);
console.log("\nRECOMMENDED CHANGES (what we advise):");
for (const r of rep.recommendations)
  console.log(
    `  [${r.priority.padEnd(10)}] ${r.title}${r.capability_key ? "  -> " + r.capability_key : ""}`,
  );
console.log("\nOUTREACH HOOK:\n  " + rep.outreach_hook);

const bundle = (
  await c.query("select * from transform_audit.recommended_bundle($1)", [worst.runId])
).rows;
console.log("\nRECOMMENDED BARBEROS BUNDLE:");
for (const b of bundle)
  console.log(
    `  ${b.capability_name.padEnd(30)} ${b.is_shipped ? "SHIPPED" : "NOT BUILT YET (" + b.status + ")"}`,
  );

console.log("\n=== stored, not computed on the fly ===");
const counts = (
  await c.query(`select
  (select count(*) from transform_audit.runs) runs,
  (select count(*) from transform_audit.findings) findings,
  (select count(*) from transform_audit.recommendations) recs,
  (select count(*) from transform_audit.dimension_scores) scores`)
).rows[0];
console.log(counts);
await c.end();
