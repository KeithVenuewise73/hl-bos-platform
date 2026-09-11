// End-to-end for the discovery call screen's data path, against a real
// PostgreSQL carrying the same migrations.
//
// What it proves, in order:
//   1. RECORD_CALL_SQL writes AS THE TENANT OWNER -- through the permission
//      checks -- rather than as the superuser the transport connects as
//   2. an absent key leaves an earlier answer alone, and an explicit null
//      clears one, which is the whole design of migration 0054
//   3. CALL_SQL reads it back, and toCallContext maps three-state answers
//      without turning "nobody asked" into "no"
//   4. matchCapabilities turns that into the gap list the screen shows
//
// The React is typechecked but not rendered here. What can be wrong is the SQL
// and the mapping, and those are what this runs.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pg = require("pg");

import {
  CALL_SQL,
  RECORD_CALL_SQL,
  answersPayload,
  toCallContext,
} from "../../apps/control-center/src/lib/discovery-sql.ts";
import {
  matchCapabilities,
  deliverableNow,
  roadmap,
} from "../../apps/control-center/src/lib/capability-match.ts";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? " -- " + detail : ""}`);
  }
}

const c = new pg.Client({
  host: "/tmp",
  port: 5433,
  user: "postgres",
  database: "hlbos",
});
await c.connect();
const run = async (sql: string): Promise<Record<string, unknown>[]> =>
  (await c.query(sql)).rows;

await run(readFileSync("/tmp/pgtest/tests/_fixtures.sql.inc", "utf8"));
await run("select tests.seed()");

const PID = "44444444-4444-4444-4444-444444444444";
await run(`insert into visibility.prospects (id, tenant_id, business_name, phone, city)
  select '${PID}'::uuid, tests.uid('tenant_a'), 'Truth Barbershop', '716-939-3443', 'West Seneca'
  on conflict (id) do nothing`);
await run(`insert into transform_audit.shop_profiles
    (prospect_id, tenant_id, locality, dedupe_key)
  select '${PID}'::uuid, tests.uid('tenant_a'), 'West Seneca', 'truth-14210'
  on conflict (prospect_id) do nothing`);

try {
  // --- 1. The write goes through the owner, not the superuser ---------------
  await run(
    RECORD_CALL_SQL(
      "tenant-a",
      PID,
      answersPayload({
        own_website: false,
        booking_platform: "GlossGenius",
        online_booking: true,
        chairs: 3,
      }),
    ),
  );
  const after1 = (
    await run(
      `select own_website, booking_platform, chairs, answered_by is not null as has_who
       from transform_audit.discovery where prospect_id = '${PID}'::uuid`,
    )
  )[0]!;
  check("a call is recorded", after1["booking_platform"] === "GlossGenius");
  check(
    "through the permission-checked path, with a person behind it",
    after1["has_who"] === true,
  );

  // --- 2. Absent leaves alone; explicit null clears --------------------------
  await run(
    RECORD_CALL_SQL("tenant-a", PID, answersPayload({ missed_call_handling: false })),
  );
  const after2 = (
    await run(
      `select booking_platform, missed_call_handling, chairs
       from transform_audit.discovery where prospect_id = '${PID}'::uuid`,
    )
  )[0]!;
  check(
    "a second call does not wipe the first",
    after2["booking_platform"] === "GlossGenius",
  );
  check("and stores the new answer", after2["missed_call_handling"] === false);
  check("leaving untouched fields alone", Number(after2["chairs"]) === 3);

  await run(RECORD_CALL_SQL("tenant-a", PID, answersPayload({ chairs: null })));
  const after3 = (
    await run(
      `select chairs from transform_audit.discovery where prospect_id = '${PID}'::uuid`,
    )
  )[0]!;
  check("an answer can be explicitly un-said", after3["chairs"] === null);

  // --- 3. The read, and the three-state mapping ------------------------------
  const rows = await run(CALL_SQL("tenant-a", PID));
  check("the screen's read returns the shop", rows.length === 1);
  const call = toCallContext(rows[0]!);
  check("with its name", call.shopName === "Truth Barbershop");
  check("and its phone", call.phone === "716-939-3443");
  check("a false answer survives as false", call.stack.ownWebsite === false);
  check(
    "a null answer survives as null, not false",
    call.stack.reviewProcess === null,
    `got ${String(call.stack.reviewProcess)}`,
  );
  check(
    "the catalog comes from the database",
    call.catalog.length >= 9,
    `${call.catalog.length} capabilities`,
  );

  // --- 4. The cross-reference ------------------------------------------------
  const gaps = matchCapabilities(call.stack, call.catalog);
  const now = deliverableNow(gaps);
  const later = roadmap(gaps);
  check("something is deliverable today", now.length === 1, `${now.length}`);
  check("and it is the module that exists", now[0]?.capability === "owned_website");
  check(
    "the platform-only shop is told whose page it is",
    now[0]?.because.includes("GlossGenius") === true,
    now[0]?.because,
  );
  check(
    "it is never pitched booking, which it already has",
    !gaps.some((g) => g.capability === "booking"),
  );
  check(
    "the deferred module is never offered",
    !gaps.some((g) => g.capability === "payments"),
  );
  check(
    "missed calls stay a question even after being answered 'no'",
    gaps.find((g) => g.capability === "missed_call_capture")?.needsConfirming === true,
  );
  check(
    "the roadmap is labelled separately",
    later.every((g) => !g.deliverableToday),
  );

  console.log(`\n  today: ${now.map((g) => g.name).join(", ")}`);
  console.log(`  roadmap: ${later.map((g) => g.name).join(", ")}`);
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
} finally {
  await c.end();
}
process.exit(failures === 0 ? 0 : 1);
