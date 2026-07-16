# Runbook — Bootstrap the First `platform_owner`

**Status:** PROPOSED design. Not implemented. **Run once, manually, by the owner.**
**Target:** `ywrzgursvdowzyhipsmt` (HL-BOS Core, Herman Legacy Software Ventures — Pro)
**Prerequisite:** Phase 2 migrations `0001`–`0006` applied. This runbook does nothing before then.

---

## 1. Why this is a runbook and not a migration

`platform.provision_tenant()` requires `platform.tenant.create`, held only via `identity.platform_admins`. `0005` seeds roles and permissions but **no admins**. On a fresh database, nobody can provision anything.

That gap is deliberate. Seeding an admin would mean committing a real person's identity — an email or an `auth.users` UUID — into version control, and creating the most privileged grant in the system from an unattended script.

Per owner instruction: **no hard-coded email address or `auth.users` UUID in any migration or committed seed file.** The identity is supplied at runbook time, as a parameter, by a human.

## 2. 🔴 Prerequisite: the owner's `auth.users` record must exist

Verified 2026-07-15 against the target:

```
select count(*) from auth.users;   ->   0
```

**There is currently no user to promote.** And there is no application to sign up through — the portal is Phase 6.

So the record is created via the dashboard:

**Dashboard → Authentication → Users → Add user**

- Email: the owner's real address
- ☑️ **Auto Confirm User** — the function below rejects unconfirmed users (§4, step 4)

Then confirm exactly one match:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('<owner-email>');
-- expect: exactly 1 row, email_confirmed_at NOT NULL
```

## 3. The function — `platform.bootstrap_first_platform_owner`

Ships in `0006`. Takes the email as a **parameter**; nothing identifying is committed.

```
platform.bootstrap_first_platform_owner(p_email citext) RETURNS uuid
  SECURITY DEFINER · owner postgres · VOLATILE · SET search_path = ''
```

### Not reachable as an RPC — two independent reasons

| Layer          | Mechanism                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Not exposed    | Lives in `platform`, which is **not** in `api.schemas` (`config.toml` = `["public"]`). PostgREST never publishes it. |
| Not executable | `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` — **no `GRANT` to any client role.**                  |

Callable only by `postgres` / `service_role` — i.e. the SQL editor or a server-side path. This is the same class of defect as legacy **SEC-3**, where `hscs_glp` trigger functions are `anon`-callable via `/rest/v1/rpc/`. Not repeating it.

### Self-disarming after first use

```
1. IF EXISTS (SELECT 1 FROM identity.platform_admins)
     -> RAISE EXCEPTION 'bootstrap already performed; use normal role grants'
```

The function is **inert once any platform admin exists**. It cannot be used to quietly add a second superuser later — that path must go through the normal, audited grant. This is what makes it genuinely one-time without needing a follow-up migration to drop it.

## 4. Logic

```
 1. -- one-time guard
    IF EXISTS (SELECT 1 FROM identity.platform_admins)
      -> RAISE 'bootstrap already performed; use normal role grants'

 2. -- explicit lookup; reject AMBIGUOUS
    SELECT count(*) INTO v_n FROM auth.users WHERE lower(email) = lower(p_email);
    IF v_n = 0 -> RAISE 'no auth.users record for %  (create it in the dashboard first)', p_email
    IF v_n > 1 -> RAISE 'ambiguous: % auth.users records match %', v_n, p_email

 3. SELECT id, email_confirmed_at INTO v_user, v_confirmed
      FROM auth.users WHERE lower(email) = lower(p_email);

 4. -- an unconfirmed signup proves nothing about who controls the address
    IF v_confirmed IS NULL
      -> RAISE 'user % has not confirmed their email; refusing to grant platform_owner', p_email

 5. INSERT INTO identity.platform_admins (user_id, role_key, granted_by)
      VALUES (v_user, 'platform_owner', v_user);
    -- audit.emit trigger on identity.platform_admins fires here (actor_type='system',
    -- because auth.uid() is NULL when run from the SQL editor)

 6. -- explicit, human-readable bootstrap record, independent of the trigger
    INSERT INTO audit.security_events
      (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
       severity, outcome, occurred_at)
    VALUES
      (NULL, 'system', v_user, 'platform.bootstrap.first_owner',
       'identity.platform_admins', v_user::text, 'critical', 'allowed', now());

 7. RETURN v_user;
```

### Requirements, mapped

| Requirement                                    | Step                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Requires an existing `auth.users` record       | 2                                                                            |
| Accepts/looks up the selected user explicitly  | 2–3 (by parameter, never hard-coded)                                         |
| Creates the platform role assignment safely    | 5 (`role_key` FK + scope trigger reject a non-platform role)                 |
| Rejects duplicate users                        | 1 (already bootstrapped) + `platform_admins.user_id` PK                      |
| Rejects ambiguous users                        | 2 (`count > 1` → raise)                                                      |
| Records an audit/bootstrap record              | 5 (trigger) **and** 6 (explicit `critical` security event)                   |
| Applied manually, only after the schema exists | Function does not exist until `0006`                                         |
| Does not remain an unrestricted public RPC     | Not in `api.schemas`; `REVOKE ALL` from client roles; self-disarms at step 1 |

## 5. Execution

**Only after** `0001`–`0006` are applied and verified on a preview branch, and only against production with explicit owner approval.

```sql
-- Dashboard -> SQL Editor. Substitute the real address. Do not commit this call.
select platform.bootstrap_first_platform_owner('<owner-email>');
```

Expected: one row, the owner's `auth.users` UUID.

### Verify

```sql
-- exactly one platform admin, and it is the intended person
select pa.user_id, pa.role_key, u.email, pa.granted_at
from identity.platform_admins pa
join auth.users u on u.id = pa.user_id;
-- expect: 1 row, role_key = 'platform_owner'

-- the bootstrap is recorded
select action, severity, outcome, occurred_at
from audit.security_events
where action = 'platform.bootstrap.first_owner';
-- expect: 1 row, severity = 'critical'

-- the function is now inert
select platform.bootstrap_first_platform_owner('<any-email>');
-- expect: ERROR  bootstrap already performed; use normal role grants
```

Re-running is how you _prove_ the one-time guard works. Do it.

## 6. Rollback

```sql
-- rollback: delete from identity.platform_admins where user_id = '<uuid>';
```

This re-arms the function (step 1 passes again once the table is empty). The `audit.security_events` row **survives** — audit is append-only and the immutability trigger rejects the delete. That is correct: a bootstrap that happened and was reverted is a fact worth keeping.

## 7. Post-bootstrap

The owner can now:

```sql
select platform.provision_tenant('first-tenant-slug', 'First Tenant Name');
```

Further platform admins are granted by inserting into `identity.platform_admins` **as an authenticated `platform_owner`**, through the normal audited path — not through this function, which is now inert.

## 8. Record of execution

Fill in when run. This table is the evidence that the most privileged grant in the platform has a name attached.

| Field                    | Value                                                |
| ------------------------ | ---------------------------------------------------- |
| Date                     | _pending_                                            |
| Environment              | _pending_                                            |
| Owner email              | _not recorded here — see `audit.security_events`_    |
| `auth.users` UUID        | _not recorded here — see `identity.platform_admins`_ |
| Executed by              | _pending_                                            |
| Verification queries run | _pending_                                            |

⚠️ The email and UUID are deliberately **not** written into this committed file. They live in the database, where the audit trail is. This document records _that_ the step happened and who ran it, not _who_ it granted.
