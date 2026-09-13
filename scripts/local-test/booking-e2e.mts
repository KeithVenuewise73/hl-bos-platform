// End-to-end for the appointment book, against a real PostgreSQL carrying 0059.
//
// The pgTAP suite proves the SQL. What this adds is the hop the suite cannot
// see: the JSON those functions actually emit, fed through the mappings the
// barbershop app uses. That is where an empty list the database explained
// could quietly arrive at a screen with the explanation stripped off.
//
// Everything is written AS THE SHOP OWNER, through the permission-checked
// functions. Connected as the superuser the run would prove the SQL parses and
// say nothing about whether a barber is allowed to do it.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pg = require("pg");

import {
  atShopTime,
  money,
  toBoard,
  toDaySheet,
  toSlots,
} from "../../apps/barbershop/src/lib/booking.ts";

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

const TENANT = "tests.uid('tenant_a')";

try {
  await asOwner(`perform barberos.upsert_shop(tests.uid('tenant_a'), 'Truth Barbershop', 3);
                 perform barberos.enable_capability(tests.uid('tenant_a'), 'client_crm');
                 perform barberos.enable_capability(tests.uid('tenant_a'), 'booking');`);

  // The shop never bought the website module, and has no page at all. Before
  // 0059 its service list could not exist, so none of what follows was possible.
  await asOwner(`
    perform barberos.upsert_site_service(tests.uid('tenant_a'), 'Skin fade', 4000, 30, 1);
    perform barberos.upsert_site_service(tests.uid('tenant_a'), 'Consultation', 1000, null, 2);`);

  const pages = Number(
    (await run(`select count(*)::int as n from barberos.sites`))[0]!["n"],
  );
  check("a shop with no web page still has a service list", pages === 0);

  // --- The rota --------------------------------------------------------------
  await asOwner(`
    declare v_marcus uuid; v_dee uuid; v_date date;
    begin
      v_date := (now() at time zone 'America/New_York')::date + 7;
      v_marcus := barberos.upsert_barber(tests.uid('tenant_a'), 'Marcus');
      v_dee    := barberos.upsert_barber(tests.uid('tenant_a'), 'Dee');
      perform barberos.set_barber_hours(v_marcus,
        extract(dow from v_date)::smallint, '09:00', '17:00');
    end;`);

  const board = toBoard(await readAsOwner(`barberos.barber_list(${TENANT})`));
  check("both barbers come back", board.barbers.length === 2);

  const marcus = board.barbers.find((b) => b.displayName === "Marcus")!;
  const dee = board.barbers.find((b) => b.displayName === "Dee")!;
  check("the one with hours has a rota", marcus.hasARota === true);
  // The distinction the whole module turns on.
  check("the one without has none, and says so", dee.hasARota === false);
  check("and that is not the same as working no days", dee.hours.length === 0);

  const fade = board.services.find((s) => s.name === "Skin fade")!;
  const consult = board.services.find((s) => s.name === "Consultation")!;
  check("a service with a length is bookable", fade.bookable === true);
  check(
    "a service without one is kept and marked unbookable",
    consult.bookable === false && consult.priceCents === 1000,
  );
  check(
    "the settings say they are the module's defaults",
    board.settings.isDefault === true && board.settings.slotMinutes === 15,
  );

  const date = String(
    (
      await run(`select ((now() at time zone 'America/New_York')::date + 7)::text as d`)
    )[0]!["d"],
  );

  // --- Five empty lists, five sentences --------------------------------------
  const noRota = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${dee.id}'::uuid, ${fade.id}, '${date}'::date)`,
    ),
  )!;
  check(
    "a barber with no rota is explained, not reported as fully booked",
    noRota.slots.length === 0 &&
      noRota.basis === "no working hours have been set for this barber yet",
    noRota.basis,
  );

  const noLength = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${marcus.id}'::uuid, ${consult.id}, '${date}'::date)`,
    ),
  )!;
  check(
    "a service with no duration says so rather than guessing half an hour",
    noLength.basis.includes("no duration recorded"),
    noLength.basis,
  );

  const notToday = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${marcus.id}'::uuid, ${fade.id}, '${date}'::date + 1)`,
    ),
  )!;
  check(
    "a day off the rota names the weekday",
    notToday.basis.startsWith("this barber does not work on"),
    notToday.basis,
  );

  const open = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${marcus.id}'::uuid, ${fade.id}, '${date}'::date)`,
    ),
  )!;
  check("a working day is open", open.basis === "open");
  check("with times counted off the rota", open.slots.length === 31);
  check(
    "and they render in the shop's own timezone",
    atShopTime(open.slots[0]!, open.timezone) === "09:00",
    atShopTime(open.slots[0]!, open.timezone),
  );

  // --- Taking one ------------------------------------------------------------
  await asOwner(`
    declare v_client uuid; v_marcus uuid; v_svc bigint;
    begin
      v_client := barberos.upsert_client(tests.uid('tenant_a'), 'Anthony Reid', '716-555-0155');
      select id into v_marcus from barberos.barbers
        where tenant_id = tests.uid('tenant_a') and display_name = 'Marcus';
      select id into v_svc from barberos.site_services
        where tenant_id = tests.uid('tenant_a') and name = 'Skin fade';
      perform barberos.book_appointment(tests.uid('tenant_a'), v_client, v_marcus, v_svc,
        ('${date}'::date + time '10:00') at time zone 'America/New_York');
    end;`);

  const sheet = toDaySheet(
    await readAsOwner(`barberos.day_sheet(${TENANT}, '${date}'::date)`),
  )!;
  check("the day sheet has the appointment", sheet.appointments.length === 1);
  check(
    "at the shop's local time, not the server's",
    sheet.appointments[0]!.localTime === "10:00",
    sheet.appointments[0]!.localTime,
  );
  check(
    "with the price captured at booking time",
    money(sheet.appointments[0]!.priceCents) === "$40.00",
  );
  check(
    "and the expected total carries its own gaps",
    sheet.expectedCents === 4000 && sheet.appointmentsWithoutAPrice === 0,
  );

  const after = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${marcus.id}'::uuid, ${fade.id}, '${date}'::date)`,
    ),
  )!;
  check(
    "the booked time and the ones overlapping it stop being offered",
    after.slots.length === 28,
    String(after.slots.length),
  );

  // --- Cancelling frees the chair and keeps the row --------------------------
  const apptId = String(
    (await run(`select id::text as id from barberos.appointments limit 1`))[0]!["id"],
  );
  await asOwner(
    `perform barberos.cancel_appointment('${apptId}'::uuid, 'Customer rang');`,
  );

  const cancelled = toDaySheet(
    await readAsOwner(`barberos.day_sheet(${TENANT}, '${date}'::date)`),
  )!;
  check(
    "a cancellation is shown, not hidden",
    cancelled.cancelled === 1 && cancelled.appointments[0]!.status === "cancelled",
  );
  check(
    "carrying why",
    cancelled.appointments[0]!.cancellationReason === "Customer rang",
  );

  const freed = toSlots(
    await readAsOwner(
      `barberos.available_slots(${TENANT}, '${marcus.id}'::uuid, ${fade.id}, '${date}'::date)`,
    ),
  )!;
  check("and the chair is free again", freed.slots.length === 31);

  // --- Finishing one writes the visit ---------------------------------------
  await asOwner(`
    declare v_client uuid; v_marcus uuid; v_svc bigint;
    begin
      select id into v_client from barberos.clients where phone = '716-555-0155';
      select id into v_marcus from barberos.barbers
        where tenant_id = tests.uid('tenant_a') and display_name = 'Marcus';
      select id into v_svc from barberos.site_services
        where tenant_id = tests.uid('tenant_a') and name = 'Skin fade';
      perform barberos.book_appointment(tests.uid('tenant_a'), v_client, v_marcus, v_svc,
        ('${date}'::date + time '11:00') at time zone 'America/New_York');
    end;`);

  // Move it into the past AS THE SUPERUSER. The shop's owner is refused this
  // write -- `authenticated` holds SELECT and nothing else on the table, so
  // every change goes through a permission-checked function -- and the book
  // itself will not create an appointment back there. Both refusals are
  // correct, and the first draft of this harness hit the first one.
  const future = String(
    (
      await run(
        `select id::text as id from barberos.appointments where status = 'booked' limit 1`,
      )
    )[0]!["id"],
  );
  await run(`update barberos.appointments
               set starts_at = now() - interval '2 hours',
                   ends_at = now() - interval '90 minutes'
             where id = '${future}'::uuid`);

  await asOwner(`perform barberos.complete_appointment('${future}'::uuid,
    '{"sides_guard": 1, "top_finish": "scissor"}'::jsonb);`);

  const visits = await run(
    `select service_name, barber, price_cents, top_finish::text from barberos.visits`,
  );
  check("completing it wrote the visit", visits.length === 1);
  check(
    "carrying what was booked and who cut it",
    visits[0]!["service_name"] === "Skin fade" && visits[0]!["barber"] === "Marcus",
  );
  check(
    "and the cut the barber added on the way past",
    visits[0]!["top_finish"] === "scissor",
  );

  const linked = await run(
    `select count(*)::int as n from barberos.appointments where visit_id is not null`,
  );
  check("the two records point at each other", Number(linked[0]!["n"]) === 1);

  console.log("");
  console.log(
    `  ${sheet.appointments[0]!.localTime} ${sheet.appointments[0]!.clientName} ` +
      `with ${sheet.appointments[0]!.barberName} — ${sheet.appointments[0]!.serviceName}, ` +
      `${money(sheet.appointments[0]!.priceCents)}`,
  );
  console.log(`  ${open.slots.length} free times on ${date}; ${noRota.basis}`);
  console.log("");
  console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
} finally {
  await c.end();
}

process.exit(failures === 0 ? 0 : 1);
