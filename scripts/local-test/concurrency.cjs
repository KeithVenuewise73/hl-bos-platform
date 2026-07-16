// t_concurrent_acceptance_yields_one_membership
// Needs two real sessions, so it cannot live inside a single pgTAP transaction.
const pg = require('pg'); const fs = require('fs');
const conn = () => new pg.Client({ host:'/tmp', port:5433, user:'postgres', database:'hlbos' });

(async () => {
  const setup = conn(); await setup.connect();
  await setup.query(fs.readFileSync('/tmp/pgtest/tests/00_fixtures.sql','utf8'));
  await setup.query('select tests.seed()');
  const { rows } = await setup.query(
    "select tests.make_invitation(tests.uid('tenant_a'), 'invitee@example.test') as tok");
  const tok = rows[0].tok;
  const inviteeRes = await setup.query("select tests.uid('invitee') as id");
  const invitee = inviteeRes.id ?? inviteeRes.rows[0].id;
  await setup.end();

  // Two sessions race for the same token.
  const race = async (label) => {
    const c = conn(); await c.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', json_build_object('sub','${invitee}','role','authenticated')::text, true)`);
      await c.query('set local role authenticated');
      const r = await c.query('select identity.accept_invitation($1) as m', [tok]);
      await c.query('commit');
      return { label, ok: true, membership: r.rows[0].m };
    } catch (e) {
      try { await c.query('rollback'); } catch {}
      return { label, ok: false, err: e.message };
    } finally { await c.end(); }
  };

  const [a, b] = await Promise.all([race('session-1'), race('session-2')]);

  const check = conn(); await check.connect();
  const cnt = await check.query(
    "select count(*)::int as n from identity.memberships where tenant_id = tests.uid('tenant_a') and user_id = tests.uid('invitee')");
  const inv = await check.query(
    "select status::text as s from identity.invitations where token_selector = split_part($1,'.',1)", [tok]);
  await check.end();

  const succeeded = [a,b].filter(x=>x.ok).length;
  const failed    = [a,b].filter(x=>!x.ok).length;
  const n = cnt.rows[0].n;

  console.log(`  ${a.label}: ${a.ok ? 'accepted' : 'denied -> ' + a.err}`);
  console.log(`  ${b.label}: ${b.ok ? 'accepted' : 'denied -> ' + b.err}`);
  console.log(`  memberships created: ${n}`);
  console.log(`  invitation status:   ${inv.rows[0].s}`);

  const pass = succeeded === 1 && failed === 1 && n === 1 && inv.rows[0].s === 'accepted';
  console.log(pass
    ? '\nok 1 - t_concurrent_acceptance_yields_one_membership: exactly one accept won, exactly one membership'
    : `\nnot ok 1 - t_concurrent_acceptance_yields_one_membership (succeeded=${succeeded} failed=${failed} memberships=${n})`);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('ERR:', e.message); process.exit(1); });
