# Dependency Policy

**Status:** Active
**Applies to:** All packages and apps in `hl-bos-platform`

---

## 1. Principle

The brief requires: _"Use current stable versions that are mutually compatible. Pin important versions rather than relying on uncontrolled latest-version behavior."_

Those two requirements are in tension, and **compatibility wins**. "Latest" is not a version — it is a moving target that changes the build under you. Every important dependency is pinned to an exact version in the `catalog:` block of `pnpm-workspace.yaml`, in one place, and bumped deliberately.

---

## 2. The TypeScript pin — read this before bumping

**TypeScript is pinned to `6.0.3`. `latest` is `7.0.2`. This is intentional.**

Verified against the npm registry on 2026-07-15:

```
typescript@latest              = 7.0.2
typescript-eslint@8.64.0 peers = { typescript: ">=4.8.4 <6.1.0",
                                   eslint: "^8.57.0 || ^9.0.0 || ^10.0.0" }
```

`typescript-eslint` — which provides all type-aware linting — **does not support TypeScript 7.** The newest stable TypeScript inside its supported range is **6.0.3**.

Taking `typescript@latest` would mean:

- `strict-peer-dependencies=true` fails the install (the intended outcome), or
- with that guard disabled, type-aware lint rules silently degrade or crash

There is no `typescript-eslint` v9/v10 release. `8.64.0` is `latest`; the only newer tags are `canary`. **Until typescript-eslint ships TS 7 support, TypeScript stays on 6.0.x.**

### Bump criteria

Move to TypeScript 7 only when _all_ hold:

1. `npm view typescript-eslint peerDependencies` admits `typescript@>=7`
2. That release is on the `latest` dist-tag, not `canary`
3. `pnpm install && pnpm check` passes with `strict-peer-dependencies=true`
4. `eslint-config-next` is compatible with the resulting matrix

---

## 3. Pinned matrix (2026-07-15)

| Dependency              | Pin       | `latest` | Notes                                                    |
| ----------------------- | --------- | -------- | -------------------------------------------------------- |
| `typescript`            | **6.0.3** | 7.0.2    | ⚠️ Held back. See §2.                                    |
| `typescript-eslint`     | 8.64.0    | 8.64.0   | Constrains TypeScript.                                   |
| `eslint`                | 10.7.0    | 10.7.0   | Flat config. Supported by ts-eslint 8.64.                |
| `@eslint/js`            | 10.0.1    | 10.0.1   | Versioned independently of `eslint`. Peers `eslint@^10`. |
| `next`                  | 16.2.10   | 16.2.10  | Peers: react `^19.0.0`. App Router.                      |
| `react` / `react-dom`   | 19.2.7    | 19.2.7   | Satisfies Next 16 peer range.                            |
| `zod`                   | 4.4.3     | 4.4.3    | Validation.                                              |
| `vitest`                | 4.1.10    | 4.1.10   | Peers: `@types/node` `^20 \|\| ^22 \|\| >=24`.           |
| `@types/node`           | 22.20.1   | 26.1.1   | Tracks the Node 22 runtime major, not latest.            |
| `@supabase/supabase-js` | 2.110.6   | 2.110.6  |                                                          |
| `@supabase/ssr`         | 0.12.3    | 0.12.3   | Cookie-based auth for App Router.                        |
| `turbo`                 | 2.10.5    | 2.10.5   | Task orchestration.                                      |
| `prettier`              | 3.9.5     | 3.9.5    |                                                          |

`next@16` requires `node >=20.9.0`; we set `engines.node >= 22`.

---

## 4. Rules

1. **Exact pins in `catalog:`.** No `^`, no `~` for anything in the catalog. Packages reference `catalog:`, never a literal version — one place to bump, no drift between packages.
2. **`strict-peer-dependencies=true` stays on.** It is the tripwire that caught the TypeScript 7 problem. Do not disable it to make an install succeed; fix the tree.
3. **No `latest` in any manifest, ever.**
4. **Bumps are their own commit** with the compatibility evidence in the message.
5. **`enable-pre-post-scripts=false`.** Transitive dependencies do not get to execute arbitrary code at install. Allowlist specific packages via `onlyBuiltDependencies` when genuinely needed.
6. **The lockfile is committed** and CI installs with `--frozen-lockfile`.

---

## 5. Verification

```bash
pnpm install            # strict peers -- fails loudly on an incompatible tree
pnpm check              # format:check + lint + typecheck + test
```

To re-audit the matrix:

```bash
for p in typescript typescript-eslint eslint next react zod vitest; do
  echo "$p = $(npm view $p version)"
done
npm view typescript-eslint peerDependencies
```
