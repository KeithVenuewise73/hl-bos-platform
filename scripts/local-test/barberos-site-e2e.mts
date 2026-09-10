// End-to-end: a real shop from the WNY list gets a page, through the real
// schema and the real permission-checked functions, then the renderer turns
// what is STORED into HTML. Nothing is passed to the renderer that did not
// come back out of PostgreSQL.
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import {
  renderSite,
  completeness,
  type SiteContent,
} from "../../supabase/functions/_shared/barberos/site_render.ts";

const c = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});
await c.connect();
const run = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;

await run(readFileSync("/tmp/pgtest/tests/_fixtures.sql.inc", "utf8"));
await run("select tests.seed()");
const T = (await run("select tests.uid('tenant_a') u"))[0].u;
await run(`select set_config('request.jwt.claims',
  json_build_object('sub', tests.uid('owner_a')::text,'role','authenticated')::text, false)`);
await run("set role authenticated");

// Truth Barbershop: real row 4 of the list, scored 80 by the audit, on a
// GlossGenius page it does not own. This is the shop the module is FOR.
await run("select barberos.upsert_shop($1,'Truth Barbershop',2)", [T]);
await run("select barberos.enable_capability($1,'owned_website')", [T]);
await run(
  `select barberos.upsert_site($1,'truth-barbershop',
  'Barbering on Seneca Street', 'Truth has been cutting on Seneca Street for years.

Walk-ins are welcome; booking is faster.',
  '716-939-3443','2476 Seneca St','West Seneca','NY','14210',
  'https://maps.google.com/?q=2476+Seneca+St+West+Seneca+NY',
  'https://truthbarbershop.glossgenius.com/')`,
  [T],
);

for (const [d, closed, o, cl] of [
  [1, false, "09:00", "19:00"],
  [2, false, "09:00", "19:00"],
  [3, false, "09:00", "19:00"],
  [4, false, "09:00", "20:00"],
  [5, false, "09:00", "20:00"],
  [6, false, "08:00", "17:00"],
  [0, true, null, null],
] as const) {
  await run("select barberos.set_site_hours($1,$2::smallint,$3,$4::time,$5::time)", [
    T,
    d,
    closed,
    o,
    cl,
  ]);
}
for (const [n, p, dur, ord] of [
  ["Haircut", 3500, 30, 1],
  ["Skin fade", 4000, 45, 2],
  ["Beard trim", 2000, 20, 3],
  ["Line up", 1500, 15, 4],
  ["Hot towel shave", null, 45, 5],
] as const) {
  await run("select barberos.upsert_site_service($1,$2,$3,$4,$5)", [T, n, p, dur, ord]);
}
await run(
  "select barberos.set_site_link($1,'instagram','https://instagram.com/truthbarbershop')",
  [T],
);

const status = (await run("select barberos.publish_site($1) s", [T]))[0].s;
console.log("publish ->", status);

// Everything the renderer sees comes back out of the database.
const content = (await run("select barberos.site_content($1) c", [T]))[0]
  .c as SiteContent;
const html = renderSite(content);
writeFileSync("/tmp/truth-barbershop.html", html);
console.log("rendered", html.length, "bytes ->", /tmp\/truth-barbershop.html/.source);

const st = completeness(content);
console.log("present:", st.present.join(", "));
console.log("missing:", st.missing.length ? st.missing.join(", ") : "(nothing)");
console.log("unstated days:", st.unstatedDays.length);

// And a shop that has filled in almost nothing, to show the honest empty page.
// owner_b already owns tenant_b in the fixture, so this needs no extra grants.
await run("reset role");
await run(`select set_config('request.jwt.claims',
  json_build_object('sub', tests.uid('owner_b')::text,'role','authenticated')::text, false)`);
await run("set role authenticated");
const T2 = (await run("select tests.uid('tenant_b') u"))[0].u;
await run("select barberos.upsert_shop($1,'88 South Barbershop',1)", [T2]);
await run("select barberos.enable_capability($1,'owned_website')", [T2]);
await run("select barberos.upsert_site($1,'88-south-barbershop')", [T2]);
const bare = (await run("select barberos.site_content($1) c", [T2]))[0]
  .c as SiteContent;
writeFileSync("/tmp/88-south-empty.html", renderSite(bare));
try {
  await run("select barberos.publish_site($1)", [T2]);
  console.log("EMPTY PAGE PUBLISHED - the gate failed");
} catch (e) {
  console.log("empty page refused publication:", (e as Error).message);
}
await c.end();
