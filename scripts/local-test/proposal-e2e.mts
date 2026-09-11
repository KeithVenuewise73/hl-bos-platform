// End-to-end for the proposal, against a real PostgreSQL carrying migration
// 0055.
//
// What it proves, in order:
//   1. the honesty trigger is REAL -- a deferred module, an invented module and
//      a planned module sold as available are each refused by the database,
//      not merely by capability_match.ts
//   2. a draft is assembled from the audit and the call, and the snapshot it
//      freezes does not move afterwards
//   3. sending freezes it, and a sent proposal cannot be edited by any path --
//      including a direct UPDATE, which is the shape of every future fix-up
//      script
//   4. the rendered document says what is missing rather than omitting it
//
// Every write goes through the permission-checked function AS THE TENANT
// OWNER, exactly as the console does. Connected as the superuser the run would
// prove the SQL parses and say nothing about whether the application would
// allow it.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pg = require("pg");

import {
  DECIDE_SQL,
  DRAFT_SQL,
  SAVE_SQL,
  SEND_SQL,
  loadAssembleContext,
  loadCatalog,
  loadProposal,
  loadProposals,
} from "../../apps/control-center/src/lib/proposal-sql.ts";
import {
  assembleDocument,
  referenceOf,
  renderProposal,
} from "../../apps/control-center/src/lib/proposal-doc.ts";
import { matchCapabilities } from "../../apps/control-center/src/lib/capability-match.ts";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? " -- " + detail : ""}`);
  }
}

/** Runs `sql` and reports whether the database refused it, and why. */
async function refused(
  run: (sql: string) => Promise<unknown>,
  sql: string,
): Promise<string | null> {
  try {
    await run(sql);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
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

const PID = "55555555-5555-5555-5555-555555555555";
const CAMPAIGN = "66666666-6666-6666-6666-666666666666";
const RUN = "77777777-7777-7777-7777-777777777777";

await run(`insert into visibility.prospects (id, tenant_id, business_name, phone, city)
  select '${PID}'::uuid, tests.uid('tenant_a'), 'Truth Barbershop', '716-939-3443', 'West Seneca'
  on conflict (id) do nothing`);
await run(`insert into transform_audit.shop_profiles
    (prospect_id, tenant_id, locality, dedupe_key)
  select '${PID}'::uuid, tests.uid('tenant_a'), 'West Seneca', 'truth-prop-14210'
  on conflict (prospect_id) do nothing`);

// A real audit with a real finding, so the document has evidence in it rather
// than an empty section that happens to render.
await run(`insert into transform_audit.campaigns (id, tenant_id, key, name)
  select '${CAMPAIGN}'::uuid, tests.uid('tenant_a'), 'wny_prop', 'WNY'
  on conflict (id) do nothing`);
await run(`insert into transform_audit.runs
    (id, tenant_id, campaign_id, prospect_id, weights, dimensions_possible, status)
  select '${RUN}'::uuid, tests.uid('tenant_a'), '${CAMPAIGN}'::uuid, '${PID}'::uuid,
         '{"website":2,"google_business":1}'::jsonb, 2, 'completed'
  on conflict (id) do nothing`);
await run(`insert into transform_audit.findings
    (run_id, dimension, code, statement, evidence_url, confidence, severity, detector)
  select '${RUN}'::uuid, 'website', 'no_online_booking',
         'No way to book online was found on the site',
         'http://truthbarbershop.test/', 'verified', 'high', 'site_fetch_v1'
  where not exists (select 1 from transform_audit.findings where run_id = '${RUN}'::uuid)`);
// An 'unknown' finding: a record that we could NOT see something. It must not
// reach the document as if it were a discovery about the shop.
await run(`insert into transform_audit.findings
    (run_id, dimension, code, statement, confidence, severity, detector)
  select '${RUN}'::uuid, 'google_business', 'gbp_unchecked',
         'Google Business Profile was not checked', 'unknown', 'info', 'site_fetch_v1'
  where not exists (select 1 from transform_audit.findings
                     where run_id = '${RUN}'::uuid and code = 'gbp_unchecked')`);
await run(`select transform_audit.recompute_composite('${RUN}'::uuid)`);
await run(`insert into transform_audit.dimension_scores
    (run_id, dimension, score, confidence, rubric_version)
  select '${RUN}'::uuid, 'website', 38, 'verified', 'v1'
  on conflict do nothing`);
await run(`select transform_audit.recompute_composite('${RUN}'::uuid)`);

// The call: a shop that books fine through GlossGenius but owns no page, and
// was never asked about the phones.
await run(`insert into transform_audit.discovery
    (prospect_id, tenant_id, own_website, booking_platform, online_booking,
     takes_walkins, chairs, answered_at, answered_by, notes)
  select '${PID}'::uuid, tests.uid('tenant_a'), false, 'GlossGenius', true,
         true, 3, now(), tests.uid('owner_a'), 'Owner answers the phone himself.'
  on conflict (prospect_id) do update set booking_platform = 'GlossGenius'`);

const SLUG = "tenant-a";

try {
  // --- 1. The honesty rules are the DATABASE's, not just TypeScript's --------
  const doc = (offer: unknown[]) =>
    ({
      shop: {
        name: "Truth Barbershop",
        locality: null,
        website_url: null,
        phone: null,
      },
      prepared_by: "Herman Legacy Digital",
      prepared_at: new Date().toISOString(),
      message: "",
      audit: null,
      call: null,
      offer,
      investment: { lines: [], note: "" },
      next_steps: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  check(
    "a deferred module cannot be put in a proposal, even unlabelled",
    (
      (await refused(
        run,
        DRAFT_SQL(
          SLUG,
          PID,
          null,
          doc([{ capability: "payments", deliverable_today: false }]),
        ),
      )) ?? ""
    ).includes("deferred"),
  );
  check(
    "a planned module cannot be sold as deliverable today",
    (
      (await refused(
        run,
        DRAFT_SQL(
          SLUG,
          PID,
          null,
          doc([{ capability: "client_crm", deliverable_today: true }]),
        ),
      )) ?? ""
    ).includes("deliverable today"),
  );
  check(
    "a module the catalog never heard of is refused",
    (
      (await refused(
        run,
        DRAFT_SQL(
          SLUG,
          PID,
          null,
          doc([{ capability: "ai_hair_oracle", deliverable_today: true }]),
        ),
      )) ?? ""
    ).includes("not in the BarberOS catalog"),
  );

  // --- 2. Assembling a real one ---------------------------------------------
  const ctx = (await loadAssembleContext(run, SLUG, PID))!;
  check("the shop assembles", ctx.shop.name === "Truth Barbershop");
  check(
    "with its audit",
    ctx.audit !== null && ctx.audit.composite !== null,
    `composite ${String(ctx.audit?.composite)}`,
  );
  check(
    "stating coverage rather than implying it",
    ctx.audit!.coverage.scored === 1 && ctx.audit!.coverage.possible === 2,
    JSON.stringify(ctx.audit!.coverage),
  );
  check(
    "carrying the finding we verified",
    ctx.audit!.findings.some((f) => f.code === "no_online_booking"),
  );
  check(
    "and NOT the one we could not check",
    !ctx.audit!.findings.some((f) => f.code === "gbp_unchecked"),
  );
  check("with what the shop said", ctx.stack.bookingPlatform === "GlossGenius");
  check("and what nobody asked left as unknown", ctx.stack.missedCallHandling === null);

  const catalog = await loadCatalog(run);
  check(
    "the catalog comes from the database",
    catalog.length >= 9,
    `${catalog.length}`,
  );
  const gaps = matchCapabilities(ctx.stack, catalog);
  const document = assembleDocument({
    shop: ctx.shop,
    audit: ctx.audit,
    stack: ctx.stack,
    answeredAt: ctx.answeredAt,
    notes: ctx.notes,
    gaps,
    preparedAt: new Date().toISOString(),
  });
  check(
    "the document reads the shop its own answers back",
    document.call!.said.some((s) => s.detail === "GlossGenius"),
  );
  check(
    "and names what nobody asked, rather than calling it a no",
    document.call!.not_asked.some((t) => t.includes("catches a call")),
  );

  await run(DRAFT_SQL(SLUG, PID, ctx.runId, document));
  const list = await loadProposals(run, SLUG, PID);
  check("a draft is stored", list.length === 1 && list[0]!.status === "draft");
  const pid = list[0]!.id;

  // --- 3. The snapshot does not move ----------------------------------------
  await run(`update barberos.capabilities set status = 'available'
              where key = 'review_engine'`);
  const stillDraft = (await loadProposal(run, SLUG, pid))!;
  check(
    "promoting a module later does not rewrite a proposal already drafted",
    stillDraft.document.offer.find((o) => o.capability === "review_engine")
      ?.deliverable_today === false,
  );
  await run(`update barberos.capabilities set status = 'planned'
              where key = 'review_engine'`);

  // --- 4. The words move; the evidence does not ------------------------------
  await run(
    SAVE_SQL(SLUG, pid, {
      ...stillDraft.document,
      message: "You're paying GlossGenius for a page that isn't yours.",
      investment: {
        lines: [{ label: "Site, built and live", amount: "$1,500", cadence: "once" }],
        note: "",
      },
      next_steps: ["A 20 minute call to confirm hours and prices."],
    }),
  );
  const edited = (await loadProposal(run, SLUG, pid))!;
  check(
    "the covering note is saved",
    edited.document.message.startsWith("You're paying"),
  );
  check("the pricing is saved", edited.document.investment.lines.length === 1);
  check(
    "and the evidence underneath it is untouched",
    edited.document.audit!.findings.length ===
      stillDraft.document.audit!.findings.length,
  );

  // --- 5. Sending freezes it -------------------------------------------------
  await run(SEND_SQL(SLUG, pid));
  const sent = (await loadProposal(run, SLUG, pid))!;
  check("it sends", sent.status === "sent");
  check("with the moment recorded", sent.sentAt !== null);

  check(
    "a sent proposal cannot be edited through the function",
    ((await refused(run, SAVE_SQL(SLUG, pid, sent.document))) ?? "").includes(
      "only a draft can be edited",
    ),
  );
  check(
    "nor by updating the table directly, as a fix-up script would",
    (
      (await refused(
        run,
        `update transform_audit.proposals set document = '{"offer":[]}'::jsonb where id = '${pid}'::uuid`,
      )) ?? ""
    ).includes("cannot be edited"),
  );
  check(
    "and it cannot be sent twice",
    ((await refused(run, SEND_SQL(SLUG, pid))) ?? "").includes("already been sent"),
  );

  // --- 6. The outcome --------------------------------------------------------
  await run(DECIDE_SQL(SLUG, pid, "accepted", "Signed on the call."));
  const decided = (await loadProposal(run, SLUG, pid))!;
  check("an outcome is recorded", decided.status === "accepted");
  check("with what they said", decided.decisionNote === "Signed on the call.");

  // --- 7. The document itself ------------------------------------------------
  const html = renderProposal(decided.document, {
    reference: referenceOf(pid),
    isDraft: false,
  });
  check("the document renders", html.startsWith("<!doctype html>"));
  check("naming the shop", html.includes("Truth Barbershop"));
  check("quoting the verified finding", html.includes("No way to book online"));
  check("and its evidence", html.includes("http://truthbarbershop.test/"));
  check(
    "leaving out the thing we could not check",
    !html.includes("Google Business Profile was not checked"),
  );
  check("stating the audit's coverage", html.includes("over 1 of the 2 dimensions"));
  check("carrying the price that was typed", html.includes("$1,500"));
  check(
    "labelling the roadmap as not yet available",
    html.includes("<strong>not available yet</strong>"),
  );
  check("and it is not stamped as a draft", !html.includes("Draft &mdash; not sent"));

  const today = decided.document.offer.filter((o) => o.deliverable_today);
  console.log(
    `\n  offered today: ${today.map((o) => o.name).join(", ") || "(nothing)"}` +
      `\n  roadmap:       ${decided.document.offer
        .filter((o) => !o.deliverable_today)
        .map((o) => o.name)
        .join(", ")}` +
      `\n  document:      ${html.length} bytes`,
  );
} finally {
  await c.end();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
