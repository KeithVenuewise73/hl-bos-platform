# Sign-in for the two HSCS dashboards

**Status: written and browser-tested against a mock. NOT deployed. `herman-supply-chain` is read-only to the
engineering session, so these are finished replacement files, not a pushed change.**

| File | Replaces | What changed |
| --- | --- | --- |
| `Lowes-KPI.html` | `Lowes-KPI.html` in `herman-supply-chain` | Staff sign-in screen before the app loads; sign-out button; the Supabase library version is pinned (was "latest 2"); database errors during upload and load are no longer swallowed (see below). |
| `dashboard.html` | `dashboard.html` in `herman-supply-chain` | Staff sign-in screen; data requests carry the signed-in user's token instead of the public key; sign-out reloads the page so nothing stays on screen; library pinned. |
| `*.patch` | | The exact line-level differences, for review. |
| `test/signin_test.cjs` | | The browser test below. |

`js/script.js` (the public contact and assessment forms) is **deliberately unchanged**: those forms must keep working for
anonymous visitors.

## Do this in this order, so nothing goes dark
1. Publish these two files (`Lowes-KPI.html`, `dashboard.html`). The tables are still open at this point, and a signed-in user
   works fine, so staff can sign in with no outage.
2. Confirm staff can sign in and see data.
3. Only then apply `../migration.sql` (after your approval). From that moment the public key alone gets nothing.

## Needs a person
- Every staff member needs a Supabase **email + password** account **and** a row in `hscs_glp.user_roles` and
  `organization_users`. Today there are 2 auth accounts and 1 active member (role `owner_ceo`). The pages use email and
  password; if the owner's account was created with a magic link or Google, a password has to be set first.
- Someone with write access to `herman-supply-chain` has to publish the two files.

## Browser test (real Chromium, mock Supabase)
`test/signin_test.cjs`: serves the pages from a fake origin, serves the libraries from local copies, and answers Supabase
calls with a mock that refuses data to the public key. **29 of 29 checks pass** on the patched pages, for both pages:
login form shown when signed out; **zero data requests** before sign-in and after a wrong password; friendly error text;
after sign-in every data request carries the user token and none the public key; the dpi schema header is preserved;
the session survives a reload; sign-out brings the form back and removes loaded data; a signed-in user with no staff
role (the mock returns no rows) does not crash the page; no unexpected network calls.
**Negative control:** the same checks against the original pages fail (4 of 4): both fetch data with the public key
within seconds of loading, with no sign-in.

## What this does not prove
- The mock is not real Supabase Auth. Not tested: a real login, real token refresh after an hour, or password reset.
- The Excel upload path was **not** run end to end (it needs real `.xlsx` files). The new error handling in it is a small
  change, but it is untested.
- The change to upload error handling matters: before, a refused database request was ignored and the page said "Done!".
  Now it stops with the database's message. That means a signed-in user who is not allowed to write sees an error
  instead of a false success. The upload still deletes the old rows before inserting the new ones, as before. If an insert
  fails after the delete, the old data is gone. That behaviour is unchanged, and worth fixing separately.
- `dashboard.html` talks to a different set of tables (`dpi.*`). Signing in there does nothing for security until those
  tables are locked down too. See the audit document, section 1b, "Further exposure found".
