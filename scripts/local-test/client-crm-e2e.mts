// End-to-end for the client record, against a real PostgreSQL carrying 0058.
//
// The pgTAP suite proves the SQL. What this adds is the hop the suite cannot
// see: the JSON those functions actually emit, fed through the mappings the
// barbershop app uses. That is where a rhythm the database declined to state
// could quietly become a number on a screen.
//
// Everything is written AS THE SHOP OWNER, through the permission-checked
// functions. Connected as the superuser the run would prove the SQL parses and
// say nothing about whether a barber is allowed to do it.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pg = require("pg");

import {
  describeCut,
  money,
  toClientDetail,
  toDueClients,
} from "../../apps/barbershop/src/lib/crm.ts";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
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

// Everything below runs as the shop's owner.
const asOwner = async (sql: string) =>
  run(`do $hl$ begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', tests.uid('owner_a')::text, 'role','authenticated')::text, true);
    set local role authenticated;
    ${sql}
    reset role;
  end $hl$;`);

const readAsOwner = async (expr: string): Promise<unknown> => {
  const rows = await run(`select (
    select r from (
      select set_config('request.jwt.claims',
        json_build_object('sub', tests.uid('owner_a')::text, 'role','authenticated')::text, true)
    ) _, lateral (select ${expr} as r) q) as out`);
  return rows[0]!["out"];
};

try {
  await asOwner(`perform barberos.upsert_shop(tests.uid('tenant_a'), 'Truth Barbershop', 3);
                 perform barberos.enable_capability(tests.uid('tenant_a'), 'client_crm');`);

  // --- 1. A client, and three visits at a real rhythm ------------------------
  await asOwner(
    `
    declare v_client uuid;
    begin
      v_client := barberos.upsert_client(tests.uid('tenant_a'), 'Marcus Webb', '716-555-0101');
      perform barberos.record_visit(tests.uid('tenant_a'), v_client, jsonb_build_object(
        'visited_on', (current_date - 90)::text, 'sides_guard', 2,
        'top_finish', 'scissor', 'fade', 'low', 'beard', true, 'beard_guard', 1,
        'line_up', true, 'price_cents', 4000, 'barber', 'Dee',
        'tools', jsonb_build_array('Wahl Magic Clip', 'T-liner')));
      perform barberos.record_visit(tests.uid('tenant_a'), v_client, jsonb_build_object(
        'visited_on', (current_date - 62)::text, 'sides_guard', 2, 'price_cents', 4000));
      perform barberos.record_visit(tests.uid('tenant_a'), v_client, jsonb_build_object(
        'visited_on', (current_date - 34)::text, 'sides_guard', 2));
    end;`
      .replace(/^\s*declare/, "declare")
      .replace(/^/, ""),
  );

  const clientId = (
    await run(`select id::text from barberos.clients where phone = '716-555-0101'`)
  )[0]!["id"] as string;

  const raw = await readAsOwner(`barberos.client_timeline('${clientId}'::uuid)`);
  const client = toClientDetail(raw)!;

  check("the client maps out of the database", client.displayName === "Marcus Webb");
  check("with every visit", client.visits.length === 3, `${client.visits.length}`);

  // --- 2. The rhythm, which the app must never invent ------------------------
  check(
    "a rhythm is reported once there are three visits",
    client.rhythm.typicalDays === 28,
    `typicalDays=${String(client.rhythm.typicalDays)}`,
  );
  check(
    "and he is six days past his own usual gap",
    client.rhythm.overdueByDays === 6,
    `overdue=${String(client.rhythm.overdueByDays)}`,
  );
  check(
    "the basis says where the number came from",
    client.rhythm.basis === "average of the last gaps",
    client.rhythm.basis,
  );

  // --- 3. Lifetime value carries its own gaps --------------------------------
  check("lifetime value totals what was recorded", client.value.totalCents === 8000);
  check(
    "and says how many visits have no price",
    client.value.visitsWithoutAPrice === 1,
    String(client.value.visitsWithoutAPrice),
  );
  check(
    "which renders as money, not as zero",
    money(client.value.totalCents) === "$80.00",
  );

  // --- 4. The cut, as a barber would say it ----------------------------------
  const first = client.visits[client.visits.length - 1]!;
  check(
    "the cut reads back the way it was recorded",
    describeCut(first) === "#2 sides, scissor on top, low fade, beard #1, line-up",
    describeCut(first) ?? "(null)",
  );
  check(
    "and the tools came with it",
    first.tools.includes("T-liner") && first.tools.includes("Wahl Magic Clip"),
    first.tools.join(","),
  );
  const bare = client.visits[0]!;
  check(
    "a visit with no cut details says so rather than rendering blank",
    describeCut(bare) === "#2 sides",
    describeCut(bare) ?? "(null)",
  );

  // --- 5. A client with no rhythm is never called overdue --------------------
  await asOwner(`
    declare v2 uuid;
    begin
      v2 := barberos.upsert_client(tests.uid('tenant_a'), 'One Visit Only', '716-555-0202');
      perform barberos.record_visit(tests.uid('tenant_a'), v2, jsonb_build_object(
        'visited_on', (current_date - 400)::text));
    end;`);

  const soloId = (
    await run(`select id::text from barberos.clients where phone = '716-555-0202'`)
  )[0]!["id"] as string;
  const solo = toClientDetail(
    await readAsOwner(`barberos.client_timeline('${soloId}'::uuid)`),
  )!;

  check(
    "one visit four hundred days ago produces NO rhythm",
    solo.rhythm.typicalDays === null,
  );
  check(
    "and therefore no overdue figure at all",
    solo.rhythm.overdueByDays === null,
    `overdue=${String(solo.rhythm.overdueByDays)}`,
  );
  check(
    "the screen is told why instead",
    solo.rhythm.basis === "not enough visits to know a rhythm",
    solo.rhythm.basis,
  );

  // --- 6. The due list ------------------------------------------------------
  const due = toDueClients(
    await readAsOwner(`barberos.clients_due(tests.uid('tenant_a'))`),
  );
  check(
    "the due list has exactly the client with a rhythm",
    due.length === 1,
    `${due.length}`,
  );
  check("and it is him", due[0]?.displayName === "Marcus Webb");
  check(
    "the man who came once four hundred days ago is NOT on it",
    !due.some((d) => d.displayName === "One Visit Only"),
  );

  console.log(
    `\n  ${client.displayName}: ${money(client.value.totalCents)} across ${client.value.visits} visits, ` +
      `every ${String(client.rhythm.typicalDays)} days, ${String(client.rhythm.overdueByDays)} days overdue` +
      `\n  due back: ${due.map((d) => d.displayName).join(", ") || "(nobody)"}`,
  );
} finally {
  await c.end();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
