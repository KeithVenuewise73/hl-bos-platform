#!/usr/bin/env bash
# Schema + access tests for revenue-center migrations against a throwaway local
# Postgres cluster. No network, no Supabase project touched.
#   bash revenue-center/tests/schema-tests.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
WORK="$(mktemp -d)"; PORT="${PGPORT:-54329}"
RUNAS=""; if [ "$(id -u)" = 0 ]; then chown "$(id -u postgres)" "$WORK" 2>/dev/null; RUNAS="runuser -u postgres --"; fi
cleanup(){ $RUNAS "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT
$RUNAS "$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null || exit 2
$RUNAS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k /tmp" -l "$WORK/log" -w start >/dev/null || { cat "$WORK/log"; exit 2; }
export PGHOST=/tmp PGPORT=$PORT PGUSER=postgres PGDATABASE=postgres
Q(){ psql -X -q -v ON_ERROR_STOP=1 "$@"; }
Q -f "$HERE/local-bootstrap.sql" || exit 2
for f in "$HERE"/../supabase/migrations/*.sql; do Q -f "$f" || { echo "MIGRATION FAILED: $f"; exit 2; }; done

A=aaaaaaaa-0000-0000-0000-00000000000a; B=bbbbbbbb-0000-0000-0000-00000000000b
UA=11111111-1111-1111-1111-111111111111; UB=22222222-2222-2222-2222-222222222222
UV=33333333-3333-3333-3333-333333333333; UX=44444444-4444-4444-4444-444444444444
Q <<SQL
insert into auth.users values ('$UA'),('$UB'),('$UV'),('$UX');
insert into revenue.organizations (id,slug,name) values ('$A','hlg','HLG'),('$B','other','Other Org');
insert into revenue.organization_members values ('$A','$UA','owner',now()),('$B','$UB','owner',now()),('$A','$UV','viewer',now());
select revenue.seed_default_catalog('$A'::uuid), revenue.seed_default_catalog('$B'::uuid);
insert into revenue.discovery_prospects values
 ('p1','$A','Pet Groomers','k1','n1','h1','{"name":"Pups"}','active','automated','','Unreviewed',now(),now()),
 ('p2','$B','Pet Groomers','k1','n1','h1','{"name":"Other"}','active','automated','','Unreviewed',now(),now());
insert into revenue.crm_businesses (id,organization_id,prospect_id,name,sector,town,website,source)
 values ('crm_p1','$A','p1','Pups','Pet Groomers','Clarence','https://x.test','chamber'),
        ('crm_p2','$B','p2','Other','Pet Groomers','X','https://y.test','chamber');
SQL

PASS=0; FAIL=0
# t "name" "role|none" "uid" expect(ok|fail|rows=N) "sql"
t(){ local name="$1" role="$2" uid="$3" exp="$4" sql="$5" out rc pre=""
  [ "$role" != none ] && pre="set local role $role; select set_config('request.jwt.claim.sub','$uid',true);"
  out=$(Q -At <<SQL 2>&1
begin; $pre
$sql
rollback;
SQL
); rc=$?
  case "$exp" in
    ok)     [ $rc -eq 0 ] && ok=1 || ok=0;;
    fail)   [ $rc -ne 0 ] && ok=1 || ok=0;;
    rows=*) n="${exp#rows=}"; last=$(printf '%s\n' "$out" | grep -E '^-?[0-9]+$' | tail -1); [ $rc -eq 0 ] && [ "$last" = "$n" ] && ok=1 || ok=0;;
  esac
  if [ $ok = 1 ]; then PASS=$((PASS+1)); echo "PASS  $name"; else FAIL=$((FAIL+1)); echo "FAIL  $name  [expected $exp, rc=$rc] $out"; fi; }

echo "--- structure"
t "RLS enabled on every revenue table" none x rows=0 "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and c.relkind='r' and not c.relrowsecurity;"
t "every table has at least one policy" none x rows=0 "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and c.relkind='r' and not exists (select 1 from pg_policies p where p.schemaname='revenue' and p.tablename=c.relname);"
t "every data table carries organization_id" none x rows=0 "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='revenue' and c.relkind='r' and c.relname not in ('organizations') and not exists (select 1 from information_schema.columns k where k.table_schema='revenue' and k.table_name=c.relname and k.column_name='organization_id');"
t "timestamps are timestamptz, due date is date" none x rows=0 "select count(*) from information_schema.columns where table_schema='revenue' and ((column_name like '%\_at' and data_type<>'timestamp with time zone') or (column_name='due_date' and data_type<>'date'));"
t "partial open-review index kept" none x rows=1 "select count(*) from pg_indexes where schemaname='revenue' and indexname='one_open_ai_review' and indexdef like '%WHERE%queued%running%';"
t "prices seeded as pending approval (5 items)" none x rows=5 "select count(*) from revenue.catalog_items where organization_id='$A' and approval_status='pending_approval';"

echo "--- anonymous"
t "anon cannot read prospects" anon "" fail "select count(*) from revenue.discovery_prospects;"
t "anon cannot read organizations" anon "" fail "select count(*) from revenue.organizations;"
t "anon cannot call is_member" anon "" fail "select revenue.is_member('$A');"
t "authenticated without membership sees 0 prospects" authenticated $UX rows=0 "select count(*) from revenue.discovery_prospects;"

echo "--- member isolation"
t "member A sees only org A prospects" authenticated $UA rows=1 "select count(*) from revenue.discovery_prospects;"
t "member B sees only org B CRM" authenticated $UB rows=1 "select count(*) from revenue.crm_businesses where id='crm_p2';"
t "member A cannot see org B CRM row" authenticated $UA rows=0 "select count(*) from revenue.crm_businesses where id='crm_p2';"
t "member A cannot insert into org B" authenticated $UA fail "insert into revenue.follow_ups (organization_id,business_id) values ('$B','crm_p2');"
t "member A cannot link org A follow-up to org B business" authenticated $UA fail "insert into revenue.follow_ups (organization_id,business_id) values ('$A','crm_p2');"
t "member A update of org B row changes nothing" authenticated $UA rows=0 "with u as (update revenue.crm_businesses set notes='x' where id='crm_p2' returning 1) select count(*) from u;"
t "member A cannot delete org B row" authenticated $UA rows=0 "with d as (delete from revenue.crm_businesses where id='crm_p2' returning 1) select count(*) from d;"
t "member A cannot read memberships of org B" authenticated $UA rows=0 "select count(*) from revenue.organization_members where organization_id='$B';"
t "member cannot grant themselves membership" authenticated $UX fail "insert into revenue.organization_members values ('$A','$UX','owner',now());"

echo "--- roles"
t "owner can write follow-up" authenticated $UA ok "insert into revenue.follow_ups (organization_id,business_id,due_date) values ('$A','crm_p1','2026-12-01');"
t "viewer can read" authenticated $UV rows=1 "select count(*) from revenue.crm_businesses;"
t "viewer cannot write" authenticated $UV fail "insert into revenue.follow_ups (organization_id,business_id) values ('$A','crm_p1');"
t "member cannot enqueue jobs directly (worker-side only)" authenticated $UA fail "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r1','$A','crm_p1','p1','queued',now());"
t "member cannot approve own catalog price" authenticated $UA fail "update revenue.catalog_items set approval_status='approved' where organization_id='$A';"

echo "--- integrity"
t "open review job: first ok" service_role "" ok "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r1','$A','crm_p1','p1','queued',now());"
t "second open review for same prospect rejected" service_role "" fail "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r1','$A','crm_p1','p1','queued',now()),('r2','$A','crm_p1','p1','running',now());"
t "re-review after completion allowed (new history row)" service_role "" ok "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at,report) values ('r1','$A','crm_p1','p1','completed',now(),'{}');
insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r2','$A','crm_p1','p1','queued',now());"
t "completed review without report rejected" service_role "" fail "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r1','$A','crm_p1','p1','completed',now());"
t "failed review without explanation rejected" service_role "" fail "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at) values ('r1','$A','crm_p1','p1','failed',now());"
t "failed review with error recorded ok" service_role "" ok "insert into revenue.crm_review_jobs (id,organization_id,business_id,prospect_id,status,queued_at,error) values ('r1','$A','crm_p1','p1','failed',now(),'model timeout');"
t "duplicate prospect identity in sector rejected" service_role "" fail "insert into revenue.discovery_prospects values ('p9','$A','Pet Groomers','k1','n9','h9','{}','reserve','manual','','Unreviewed',now(),now());"
t "same identity in another sector allowed" service_role "" ok "insert into revenue.discovery_prospects values ('p9','$A','Dental','k1','n9','h9','{}','reserve','manual','','Unreviewed',now(),now());"
t "second CRM account for same prospect rejected" service_role "" fail "insert into revenue.crm_businesses (id,organization_id,prospect_id,name,sector,town,website,source) values ('crm_dup','$A','p1','Pups','x','x','x','x');"
t "invalid CRM stage rejected" service_role "" fail "update revenue.crm_businesses set stage='Bogus' where id='crm_p1';"
t "legacy text IDs preserved" service_role "" rows=1 "select count(*) from revenue.crm_businesses where id='crm_p1' and prospect_id='p1';"

echo "--- proposal approval gate"
t "Draft proposal with TBD amounts ok" authenticated $UA ok "insert into revenue.proposals (organization_id,business_id,title) values ('$A','crm_p1','Website pilot');"
t "Ready for review without approval ok" authenticated $UA ok "insert into revenue.proposals (organization_id,business_id,title,status,one_time_cents,monthly_cents) values ('$A','crm_p1','t','Ready for review',99500,4900);"
t "Sent without approver rejected" authenticated $UA fail "insert into revenue.proposals (organization_id,business_id,title,status) values ('$A','crm_p1','t','Sent');"
t "Sent with approver and timestamps ok" authenticated $UA ok "insert into revenue.proposals (organization_id,business_id,title,status,approved_by,approved_at,sent_at) values ('$A','crm_p1','t','Sent','$UA',now(),now());"
t "Draft -> Sent by update without approver rejected" authenticated $UA fail "insert into revenue.proposals (id,organization_id,business_id,title) values ('99999999-9999-9999-9999-999999999999','$A','crm_p1','t'); update revenue.proposals set status='Sent' where id='99999999-9999-9999-9999-999999999999';"
t "Draft -> Sent by update WITH approver ok" authenticated $UA ok "insert into revenue.proposals (id,organization_id,business_id,title) values ('99999999-9999-9999-9999-999999999999','$A','crm_p1','t'); update revenue.proposals set status='Sent',approved_by='$UA',approved_at=now(),sent_at=now() where id='99999999-9999-9999-9999-999999999999';"
t "negative amount rejected" authenticated $UA fail "insert into revenue.proposals (organization_id,business_id,title,one_time_cents) values ('$A','crm_p1','t',-1);"

echo; echo "RESULT: $PASS passed, $FAIL failed"; [ $FAIL -eq 0 ]
