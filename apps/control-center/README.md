# Development Control Center

Run Herman Legacy Software Ventures without a terminal.

## Start it

Double-click **`scripts\control-center.bat`**. It opens at http://localhost:4000.

Leave the black window open while you use the console; close it to shut down.

## What it does

**Runs on your machine only.** It is never published to the internet — it drives `git` and the build system directly, so exposing it publicly would let anyone run commands on your computer. Server Actions are locked to `localhost` for that reason.

| Section            | Where the data comes from                                |
| ------------------ | -------------------------------------------------------- |
| Project status     | Live `git` in this folder                                |
| Actions            | Really runs the build, tests and push                    |
| Quality checks     | GitHub — **needs a token** (see below)                   |
| Your decisions     | Computed. Only appears when a human must choose.         |
| Active development | `.hlbos/milestone.json`, version-controlled              |
| Portfolio          | `src/lib/registry.ts` — honest about what does not exist |
| Release history    | Empty until something is actually deployed               |
| Morning brief      | Everything above, summarised                             |

## Connect GitHub (one-time)

Without this the console still works for everything local. With it, you also see pull requests and whether the checks passed.

1. Go to https://github.com/settings/tokens?type=beta
2. **Generate new token** → repository access → **`hl-bos-platform`**
3. Permissions → Repository → **Contents: Read**, **Pull requests: Read**, **Checks: Read**
4. Create a file called `.env.local` in this folder containing:

```
HLBOS_GITHUB_TOKEN=github_pat_...
```

`.env.local` is gitignored — the token never leaves your machine.

**Read-only on purpose.** The console shows you things and prepares decisions; it does not merge or deploy behind your back.

## What is deliberately missing

Deploy, Rollback and Sync buttons do not exist yet — nothing has ever been deployed, so they would have nothing to do. They appear when the thing behind them is real.

Release history, revenue and most of the portfolio are empty for the same reason: **HL-BOS does not invent data to fill a dashboard.** An empty panel that tells you why is worth more than a green one that is lying.
