# @hl-bos/sitegen-spec

The contract for HLG SiteGen: every generated website is one validated JSON
**SiteSpec** (v1). AI never writes code or HTML; it can only produce a spec, and
a spec that does not pass this package is not a site. No HTML, no network, no AI
in here.

The database (`supabase/migrations/..._0060_sitegen_core.sql`) enforces the core
rules on every save. This package enforces those **and** the deep shape of every
page section, and mirrors the database's edit-scope comparison so the UI can
tell a client what they may change before they try.

| File              | Responsibility                                                                      |
| ----------------- | ----------------------------------------------------------------------------------- |
| `schema.ts`       | zod schema: strict objects, no HTML, https/tel/sms links only, section union        |
| `scopes.ts`       | `changedScopes(base, next)`: mirrors the SQL in `sitegen.save_version`              |
| `color.ts`        | WCAG `contrastRatio`, `onColor` (black/white >= 4.5:1), `mixHex`                    |
| `fonts.ts`        | The font allowlist and CSS stacks (mirror `sitegen.theme_fonts` seed)               |
| `verticals.ts`    | `VERTICALS` registry as data (barber: HairSalon, CTA book -> call) and `resolveCta` |
| `default-spec.ts` | `defaultSpec(vertical, intake)`: a valid starter spec from intake data only         |
| `claims.ts`       | `findUnsupportedClaims(spec, intake)`: staff-review list of unbacked claims         |
| `contact.ts`      | E.164 helpers: `tel:` / `sms:` links, display format                                |

```
pnpm --filter @hl-bos/sitegen-spec typecheck
pnpm --filter @hl-bos/sitegen-spec test
```

## Honest limits

- **Two implementations of the same rules can drift.** The database checks
  theme/profile/hero.choice/claims in SQL; this schema re-states them in zod.
  `changedScopes` is pinned to the cases in `supabase/tests/60_sitegen.sql`, but
  nothing compares the two automatically. Change one, change the other.
- This schema is **stricter** than the database in places (unknown keys inside
  `profile` and `hero` are rejected here; the database ignores them; `<`/`>` are
  rejected in all text). Lengths are JS UTF-16 units here, characters in SQL.
- The database checks that a hero library key / logo / hero asset exists. This
  package cannot: it only checks the shape.
- `findUnsupportedClaims` is a **finder, not a proof**: regex patterns plus
  number matching against intake. It will miss a cleverly worded claim, and it
  lists user-supplied claims for review because intake cannot back them.
- Prices are `priceCents` with no currency; v1 treats them as USD.
- Only the `barber` vertical exists.
