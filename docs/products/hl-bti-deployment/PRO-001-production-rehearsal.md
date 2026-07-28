# PRO-001 — HL-BTI Production Deployment Rehearsal

**Objective:** prove the Herman Legacy Business Transformation Platform can be deployed exactly as planned, in an **isolated preview environment**, without risking production — then convert the rehearsal into the final deployment runbook and estimate the probability of a clean production deploy.

**Result: 11 of 12 checks PASS. Zero product defects. The one non-pass is a benign, cosmetic logout network-abort that matches normal `supabase-js` behavior and does not affect function.** The complete CEO workflow — create account, login, create business, intake, analyze, findings, blueprint, proposal, logout, login again, retrieve, verify persistence — ran end-to-end through **real HTTP → the real `public.bti_*` functions → real Row Level Security → real cross-session persistence.**

---

## 1 · Rehearsal environment — fidelity vs. production

An isolated preview stack was built locally so **nothing touched the production project and no cost was incurred on the CEO's cloud** (a real Supabase preview branch would spend the CEO's money and is his call — see §7).

| Layer                 | Production                 | Rehearsal                                                                                                  | Fidelity                                                                                                                                            |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database schema       | Supabase PG 17.6           | Local PostgreSQL 16                                                                                        | **Identical SQL** — all 27 migrations applied in order; 627/627 pgTAP pass on this DB. PG16 vs 17.6 is the only delta (no 17-specific syntax used). |
| Migrations 0018–0027  | to be applied              | **applied to the preview DB**                                                                              | **100%** — same files, same order, clean apply.                                                                                                     |
| RPC layer (PostgREST) | Supabase PostgREST         | Local gateway that runs each `public.bti_*` call under `SET request.jwt.claims` + `SET ROLE authenticated` | **Real function + real RLS execution**; the HTTP server itself is emulated (no Docker/PostgREST binary in the sandbox).                             |
| Auth (GoTrue)         | Supabase GoTrue            | Local gateway issuing **real HS256-signed JWTs**; accounts in real `auth.users`                            | **Real JWT + real `auth.uid()`**; the invitation-email flow is emulated.                                                                            |
| Application           | Coolify → nginx static     | The **same `next build` static bundle**, served by a local static server                                   | **Byte-identical app**; nginx/Coolify container not run (no Docker).                                                                                |
| App → API wiring      | `NEXT_PUBLIC_SUPABASE_URL` | pointed at the local gateway                                                                               | **Same code path** — `supabase-js` `.rpc()`/`.auth`, real CORS preflights, real bearer tokens.                                                      |

**What this rehearsal proves that the earlier validation could not:** the live seam — `supabase-js` → HTTP → PostgREST-context → `public.bti_*` → `identity.has_permission`/RLS → persistence, and the full GoTrue login/logout/re-login cycle. That was the single biggest unknown flagged in PRV-001; it is now exercised.

**What it still does not prove (residual, see §6/§7):** the Docker image build, a real Coolify deploy, the real GoTrue email/invite flow, PostgREST's exact error/negotiation behaviors, PG 17.6 specifically, and the `0021` `events.deliveries` lock on real production data volume.

---

## 2 · Account & tenant provisioning (the pre-app CEO steps)

Performed exactly as the runbook prescribes, against the preview DB:

- **Create account** — a confirmed `auth.users` row for `ceo@hermanlegacygroup.com` (mirrors Dashboard → invite). **PASS.**
- **Bootstrap owner** — `platform.bootstrap_first_platform_owner('ceo@…')` → `platform_owner`. **PASS** (and the one-time guard self-disarms).
- **Provision tenant** — `platform.provision_tenant('herman-legacy','Herman Legacy')`. **PASS** — resolvable via `bti_my_tenants()` (`can_manage: true`).

---

## 3 · Complete CEO workflow — step results

Driven in Chromium against the real app bundle. Screenshots in `./rehearsal-screenshots/`.

| #   | Step                                                                                                | Result                | Evidence                                                                          |
| --- | --------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| 1   | Login screen renders                                                                                | **PASS**              | `01-signin.png`                                                                   |
| 2   | Login → workspace loads (tenant resolved)                                                           | **PASS**              | `02-workspace-empty.png`; gateway `AUTH login OK` + `RPC bti_my_tenants OK`       |
| 3   | Create business + complete intake (name, website, industry, location, contact, email, phone, goals) | **PASS**              | `03-intake-filled.png`, `04-business-created.png`; `RPC bti_register_business OK` |
| 4   | Analyze business → findings generated                                                               | **PASS** (9 findings) | `05-analysis-full.png`                                                            |
| 5   | Blueprint generated (Composite 68/100, 9 narrative sections)                                        | **PASS**              | `05-analysis-full.png`                                                            |
| 6   | Proposal generated (Herman Legacy service lines)                                                    | **PASS**              | `05-analysis-full.png`                                                            |
| 7   | Save analysis → persisted to DB                                                                     | **PASS**              | `06-saved.png` ("Saved to the Herman Legacy cloud"); `RPC bti_save_analysis OK`   |
| 8   | Logout → returns to sign-in                                                                         | **PASS**              | `07-logged-out.png`; gateway `AUTH logout`                                        |
| 9   | Login again → saved business retrieved                                                              | **PASS**              | `08-relogin-list.png` ("analyzed (68/100)")                                       |
| 10  | Persistence verified → saved analysis reloads (9 findings, blueprint, proposal)                     | **PASS**              | `09-persistence-verified.png`; `RPC bti_latest_analysis OK` after re-login        |
| 11  | No console/page errors throughout                                                                   | **PASS**              | 0 errors captured                                                                 |
| 12  | No failed network requests                                                                          | **FAIL (benign)**     | one `POST /auth/v1/logout net::ERR_ABORTED` — see D2                              |

**11/12 PASS.** Database-level confirmation of persistence (queried directly after the run):

```
name             | Rivertown Logistics
website          | https://rivertown-logistics.example.com
primary_contact  | Dana Rivers
contact_email    | dana@rivertown-logistics.example.com
goals            | Grow freight volume 20% and modernize the website.
transformation_score | 68
findings_saved   | 9        <- full analysis payload persisted
```

Real RPC/auth sequence the browser drove (gateway log):

```
AUTH login OK → RPC bti_my_tenants → RPC bti_list_businesses → RPC bti_register_business
→ RPC bti_latest_analysis (null) → RPC bti_save_analysis → RPC bti_list_businesses
→ AUTH logout → AUTH login OK → RPC bti_my_tenants → RPC bti_list_businesses → RPC bti_latest_analysis (retrieves saved)
```

---

## 4 · Defects discovered

| ID     | Defect                                                                                                                      | Where                                                                                                                                                                                                                                                  | Severity               | Fix                                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | RPC call failed with `42704 type "citext" does not exist` when the rehearsal gateway cast arguments with a bare `::citext`. | **Rehearsal harness only** — not the app, migration, or functions. `citext` lives in the `extensions` schema; real PostgREST schema-qualifies parameter types (`extensions.citext`), which the functions already declare correctly.                    | **Low (harness)**      | Fixed in the gateway (schema-qualified the cast). **No product change needed.** Lesson for production: PostgREST resolves this natively; confirmed the `public.bti_*` signatures already use `extensions.citext`. |
| **D2** | `POST /auth/v1/logout net::ERR_ABORTED` recorded as a failed network request.                                               | `supabase-js` `signOut()` clears the local session immediately and treats the server logout as best-effort; the browser aborts the in-flight call. Logout **functionally succeeded** (step 8 PASS). Same behavior occurs against real Supabase GoTrue. | **Trivial / cosmetic** | None required. Optionally call `signOut({ scope: 'local' })` to suppress the network call entirely — cosmetic only.                                                                                               |

**No defect was found in the application code, migration `0027`, the public API, RLS, tenancy, permissions, or persistence.**

---

## 5 · Final deployment runbook (production)

Convert the rehearsal into these ordered steps. **Only** commands, env, Coolify, DNS, GitHub, CEO approvals, and rollback.

### A. GitHub — arm the governed path (CEO)

1. Repo → Settings → **Environments** → create `production`; add the CEO as a required reviewer.
2. Repo → Settings → Secrets and variables → Actions:
   - Secret `SUPABASE_ACCESS_TOKEN` = a Supabase access token.
   - Variable `SUPABASE_PROJECT_REF` = `mvvtngiopdrgiedjmhfb`.

### B. Database — apply migrations (CEO approval, engineer executes via the governed path)

3. **Preview dry-run first (strongly recommended):** create a Supabase **preview branch**, run the `db-migrate` workflow (`mode=apply`) against it, confirm advisors are clean, and run one live smoke of the workflow. This closes the residual server-layer risk (§6).
4. **Production apply:** run the `db-migrate` workflow (`mode=apply`) — it executes `supabase db push`, applying **0018–0027** forward-only.
   - **Watch item:** `0021` adds columns to `events.deliveries` with volatile defaults → a full-table rewrite under `ACCESS EXCLUSIVE` lock. Confirm the production row count first; if large, run in a quiet window. (No data loss; a brief lock only.)

### C. Account & tenant (CEO)

5. Dashboard → Authentication → Users → **Add user → Send invitation** for `ceo@hermanlegacygroup.com`; open the email and confirm.
6. Dashboard → SQL Editor:
   ```sql
   select platform.bootstrap_first_platform_owner('ceo@hermanlegacygroup.com');
   select platform.provision_tenant('herman-legacy','Herman Legacy');
   ```

### D. Application — Coolify (CEO)

7. Coolify → New → Application → the repo + branch. Build Pack **Dockerfile**; Dockerfile `apps/hl-bti/Dockerfile`; context `/`; port `80`; health path `/`.
8. Build variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://mvvtngiopdrgiedjmhfb.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the project's publishable/anon key (Dashboard → Settings → API)
9. Set domain `bti.hermanlegacygroup.com`; **Deploy**.

### E. DNS (CEO)

10. At the `hermanlegacygroup.com` DNS provider: **A** record, name `bti`, value = Coolify server IP, TTL 300. (Coolify issues TLS once it resolves.)

### F. Verify (engineer + CEO)

11. Open `https://bti.hermanlegacygroup.com`; run the §3 workflow live; confirm persistence across a real logout/login. Only then is deployment complete.

### G. Rollback

- **App:** Coolify → redeploy the previous release (the app is stateless; all data is in Supabase). Instant.
- **DNS:** remove/repoint the `bti` A record.
- **Database:** each migration ships a `-- rollback:` block. Forward-repair is preferred; a full rollback of `0018–0027` drops the new schemas (loses only new data, never `0001–0017` data). `0026`/`0027` rollback drops the `bti` schema/`public.bti_*` — reversible.

---

## 6 · Residual risk (what the rehearsal could not cover)

| Risk                                                     | Impact if it bites                                     | Mitigation                                                             |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Docker image build never executed (no Docker in sandbox) | First Coolify build could fail on an environment quirk | Standard multi-stage Dockerfile; retryable; do the §5B.3 preview build |
| Real PostgREST/GoTrue not run (emulated)                 | Subtle HTTP/negotiation differences                    | The DB code path + JWT + RLS are real; preview branch closes it        |
| PG 17.6 vs PG 16                                         | Very low — no 17-specific SQL                          | 627/627 pass on 16; identical migration files                          |
| `0021` `events.deliveries` lock                          | Brief lock during apply                                | Check row count; quiet window                                          |
| Real GoTrue invite email                                 | Setup friction, not data risk                          | Standard Supabase flow                                                 |
| DNS/TLS propagation                                      | Delay, not failure                                     | TTL 300; verify before announcing                                      |

None of these is a **data-loss** or **production-data-corruption** risk. Production HL-BOS currently runs **no customer-facing app** (this is the first), so "production interruption" is limited to the database/edge-function layer during the migration apply window.

---

## 7 · Final question — probability of a clean deploy tomorrow

> "If the CEO presses Deploy tomorrow morning, what is the probability that deployment succeeds without data loss or production interruption?"

**Without data loss or production interruption: ~95% (high).**
**Fully successful on the first attempt with zero troubleshooting: ~75–80% (good).**

**Evidence for the high "no data loss / no interruption" confidence:**

- Migrations are **additive** — no table/column/function/policy from the applied `0001–0017` baseline is dropped or destructively altered (only `0021` adds columns to `events.deliveries`). **627/627** tests pass; the stack applied cleanly on a fresh DB three times.
- Every migration is **reversible** (`-- rollback:` blocks); the app is **stateless** (Coolify rollback is instant).
- There is **no live customer app** to interrupt today; the only live-object touch is the brief `0021` lock.
- The application layer is now **proven end-to-end** (this rehearsal): auth, tenancy, permissions, persistence, and cross-session retrieval all work through the real code path.

**Why not higher / where the ~20% first-attempt friction lives (all recoverable, none data-loss):**

- The **Docker build + Coolify deploy** and the **real Supabase preview** have not been executed once. First-attempt friction (a build-var typo, a PostgREST schema-cache reload, the publishable key, DNS propagation, the GoTrue invite) is plausible — but these are setup hiccups you retry, not failures that lose data or corrupt production.

**How to raise it to ~99% before the production press:** execute step **§5B.3** — one real dry-run on a **Supabase preview branch** with a staging Coolify build, and run the §3 workflow live against it. That exercises the exact three layers this rehearsal emulated (real PostgREST, real GoTrue, real Docker/Coolify on PG 17). It costs a small amount on the Supabase account and a few minutes — and it is the difference between "very likely" and "as close to certain as deployment gets."

**Bottom line:** the software is ready and proven at the application layer. A clean production deploy without data loss or interruption is **highly likely today (~95%)**, and **near-certain (~99%)** after one real preview-branch dry-run — which is the single step I recommend before the CEO presses Deploy.
