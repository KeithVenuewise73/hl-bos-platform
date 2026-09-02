# Development Control Center

Run Herman Legacy Software Ventures without a terminal.

## Start it

Double-click **`scripts\control-center.bat`**. It opens at http://localhost:4000.

Leave the black window open while you use the console; close it to shut down.

### Getting new work

Every start collects whatever has been finished since last time. Double-click
the launcher and it brings the folder up to date from GitHub, reinstalls
libraries if they changed, rebuilds if the code changed, and then starts. There
is no separate update step and nothing to type.

It is deliberately timid about it. If you have unsaved changes in the folder it
touches nothing. If the folder and GitHub have both moved on it stops and says
so rather than merging blindly. If GitHub cannot be reached it starts anyway
with the copy already on the machine. Every one of those cases prints one line
saying which happened.

The launcher can also be dropped into an older copy of this folder on its own
and will collect everything else itself. That matters exactly once: a
self-updating launcher cannot deliver its own first copy.

### First run

The launcher sets itself up. It needs **nothing on your PATH**, no admin rights, and no
developer tools installed. It does not use `corepack` — that needs admin to write its
shims and fails silently when it cannot, which is exactly how the first version of this
launcher broke.

It installs its own copy of the build tool into `.hlbos/toolchain`, pinned to the same
version as `packageManager` in `package.json`, and runs it through Node directly. Nothing
is installed system-wide. Nothing outside this folder is touched.

**The one prerequisite is Node.** If it is missing the launcher says so in plain English
and opens the download page — an ordinary Windows installer, double-click and Next. Then
double-click the launcher again and it does the rest.

`scripts/local-test/verify-bootstrap.sh` proves this sequence works on a machine with no
pnpm, with `PATH` stripped so nothing can leak in from the environment.

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
| Video Studio       | Your own picture, read in the browser. Nothing uploaded. |

## Video Studio

**Video Studio** in the header turns a picture into a video. Pick an image, it
finds the panels, you watch the preview, you press Record and a `.mp4` lands in
your Downloads folder.

It runs entirely in the browser on this machine. The image is never uploaded,
there is no account to connect and it costs nothing. What moves is the camera —
pans and zooms across the artwork you gave it. It does **not** generate motion;
the page says so plainly, and there is no button for the thing that is not built.

Recording happens in real time, so a seventeen-second video takes seventeen
seconds. Leave the tab in front while it runs.

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
