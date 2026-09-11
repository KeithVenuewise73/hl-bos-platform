# BarberOS — the shop's app

The first surface a barbershop signs into and operates itself.

## Why it exists

BarberOS had a capability spine (0048), a real module (0052) and a page served
to the public internet (0053, live at shops.hermanlegacydigital.com) — and **no
way for the shop to touch any of it**. `supabase/config.toml` exposes exactly
one schema through PostgREST:

```toml
schemas = ["public"]
```

That is a deliberate security control. Its consequence was that every
permission-checked write function 0052 shipped lived in `barberos` and was
unreachable from any application, so a shop's page could only be edited by
somebody running SQL by hand — which meant Herman Legacy Digital operating the
page on the shop's behalf, forever.

Migration **0056** is the door: one `public.barberos_*` function per operation a
shop owner actually performs, granted to `authenticated` and nothing else. This
app is what walks through it.

## The two rules it is built on

**It holds no service-role key, and cannot usefully hold one.** Every request is
made as the signed-in barber using the publishable key and their own cookies, so
the RLS policies and `identity.has_permission()` checks inside the database
decide what happens. A service-role key would bypass all of it and put this app
between a shop and its own data.

**It has no authorization logic of its own.** It asks `barberos_my_shops()` what
this person may do and draws its controls from the answer — and a permission it
does not recognise reads as `false`. The database enforces it either way; the
answer only decides whether a control is shown at all, because a button that
fails when pressed is worse than no button.

Two more defaults, both chosen for which way it is safe to be wrong:

- a page status it does not recognise reads as **draft**. Telling a shop its
  page is live when it is not is the expensive mistake — they find out from a
  customer who could not find them.
- a price it cannot parse is sent as **no price**, never zero. `$0.00` on a
  public page because somebody typed "ask" is worse than no price at all.

There is deliberately **no dev-role bypass**, unlike the Executive Portal. A
bypass that has to be correctly guarded is one that can be incorrectly guarded,
and this holds a customer's own data.

## Running it

```bash
pnpm --filter @hl-bos/barbershop dev     # http://localhost:4400
```

Needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Both are browser-safe by the platform's ENV_SPEC — RLS is the boundary, not
secrecy. Without them the app says so rather than showing an empty shop.

## What is proved, and what is not

| Proved                    | How                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API surface           | 33 pgTAP assertions in `supabase/tests/56_barberos_shop_api.sql`, run as real roles — including that a `staff` account is refused every write the wrapper exposes, and that `anon` gains nothing |
| The mappings              | 24 unit tests in `src/lib/barberos.test.ts`                                                                                                                                                      |
| It compiles as a Next app | `pnpm --filter @hl-bos/barbershop build`                                                                                                                                                         |

**Not proved: anything between them.** The PostgREST hop and the screens
themselves have never been exercised — no barber has signed in, nothing is
deployed, and migration 0056 is not applied anywhere.
