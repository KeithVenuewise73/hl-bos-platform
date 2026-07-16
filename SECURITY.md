# Security

## Reporting a vulnerability

Report privately to the repository owner. **Do not open a public issue.**

Include: what you found, how to reproduce it, and the blast radius. If you believe tenant data is exposed, say so first.

## Model

HL-BOS is multi-tenant. The controlling assumption is that **any authenticated user may be hostile toward any other tenant**, and the database — not the UI, and not the application layer — is what stops them.

| Control               | Rule                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row Level Security    | Mandatory on every tenant-owned table, with `FORCE`. Deny by default.                                                                                      |
| Tenant identity       | Every tenant-owned record carries an enforceable `tenant_id`.                                                                                              |
| Authorization         | Permission model, not role-name string checks. Enforced server-side.                                                                                       |
| Helper functions      | `SECURITY DEFINER` + explicit `search_path`. Every body filters on `auth.uid()`. A tenant ID passed as an argument is a **filter**, never proof of access. |
| Service role          | Bypasses RLS entirely. Server-only. Never in a browser bundle.                                                                                             |
| Secrets               | Supabase Vault, referenced by key. Never in a table readable by `authenticated`. Never in source control.                                                  |
| Feature/module gating | Enforced in RLS policies, not only hidden in the UI.                                                                                                       |
| Audit                 | Append-only. No `UPDATE`/`DELETE` policy exists for any role.                                                                                              |
| AI                    | No autonomous high-risk action. Approval gates before send, publish, bill or bid.                                                                          |

## Automated enforcement

- **CI:** gitleaks, plus `scripts/check-no-public-secrets.sh` (rejects private secrets behind `NEXT_PUBLIC_`), plus `scripts/check-migrations.sh` (rejects secrets in migrations and unapproved destructive DDL).
- **ESLint:** blocks direct `process.env` access, direct `SUPABASE_SERVICE_ROLE_KEY` reads, and `NEXT_PUBLIC_*SECRET|KEY|TOKEN|PASSWORD`.
- **`@hl-bos/config`:** validates and classifies every variable at startup; refuses to surface a server-only value in a browser context.

## Known findings in the existing production database

The production Supabase project predates this repository and has **open security findings**, documented in [`docs/architecture/current-state-audit.md`](docs/architecture/current-state-audit.md) §4.

The most serious is **SEC-1**: `public.ltr_data`, `kpi_sp_weekly` and `kpi_spe_weekly` carry `USING(true) WITH CHECK(true)` granted to `PUBLIC`, which includes `anon`. **2,481 rows are readable and writable by anyone holding the publishable key.**

These are pre-existing and outside Core v1 scope. Remediation is proposed and **awaiting owner approval**, because removing anonymous access will break any client currently relying on it and the affected frontends are not visible from this repository.
