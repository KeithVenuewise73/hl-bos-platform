#!/usr/bin/env node
// Put the HL-BOS icons on the Windows desktop, each ONCE.
//
//   "HL-BOS Control Center"  double-click: the console starts and opens
//   "DateSort"               double-click: DateSort starts and opens
//
// The first time HL-BOS starts on a computer (from the Control Center or
// from DateSort.bat) this makes both icons. After that it never makes an
// icon again, so deleting one is a choice that sticks.
//
// "Once" is remembered per icon in .hlbos/desktop-shortcut*.json, which are
// gitignored on purpose: the updater refuses to update a folder with stray
// files in it, so a tracked-looking file here would silently stop updates
// arriving.
//
// It never blocks startup and never throws: any problem is one line of
// output and startup carries on. Off Windows it does nothing.
//
// Paths go to PowerShell as environment variables, never inside the script
// text, so a folder name with quotes or spaces cannot change what runs.
//
// Usage: node scripts/desktop-shortcut.mjs   (prints one line per icon, exits 0)
//   env DATESORT_DESKTOP  desktop folder to use instead of the real one (tests)
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every icon this makes. The DateSort marker keeps its original name so a
 *  computer that already has (or deleted) that icon is not asked again. */
export const SHORTCUTS = {
  dateSort: {
    label: "DateSort",
    marker: path.join(ROOT, ".hlbos", "desktop-shortcut.json"),
    target: path.join(ROOT, "scripts", "DateSort.bat"),
    icon: path.join(ROOT, "scripts", "assets", "datesort.ico"),
    name: "DateSort.lnk",
    description: "DateSort - organize camera photos by the day they were taken",
  },
  controlCenter: {
    label: "Control Center",
    marker: path.join(ROOT, ".hlbos", "desktop-shortcut-control-center.json"),
    target: path.join(ROOT, "scripts", "control-center.bat"),
    icon: path.join(ROOT, "scripts", "assets", "control-center.ico"),
    name: "HL-BOS Control Center.lnk",
    description: "HL-BOS Development Control Center",
  },
};

/**
 * The PowerShell. It reads every path from the environment. Prints exactly
 * one of: "created <path>", "exists <path>", "other <path>".
 */
export const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$desk = $env:DS_DESKTOP",
  "if (-not $desk) { $desk = [Environment]::GetFolderPath('Desktop') }",
  "$lnk = Join-Path $desk $env:DS_NAME",
  "$shell = New-Object -ComObject WScript.Shell",
  "if (Test-Path -LiteralPath $lnk) {",
  "  $old = $shell.CreateShortcut($lnk)",
  // Ours already, or a different, working shortcut someone made: leave it.
  // A shortcut whose target is gone (HL-BOS moved) is repaired below.
  '  if ($old.TargetPath -ieq $env:DS_TARGET) { "exists $lnk"; exit 0 }',
  '  if ($old.TargetPath -and (Test-Path -LiteralPath $old.TargetPath)) { "other $lnk"; exit 0 }',
  "}",
  "$s = $shell.CreateShortcut($lnk)",
  "$s.TargetPath = $env:DS_TARGET",
  "$s.WorkingDirectory = $env:DS_ROOT",
  '$s.IconLocation = "$($env:DS_ICON),0"',
  "$s.Description = $env:DS_DESCRIPTION",
  "$s.Save()",
  '"created $lnk"',
].join("\n");

function readMarker(marker) {
  try {
    return JSON.parse(readFileSync(marker, "utf8"));
  } catch {
    return null;
  }
}

function runPowerShell(sc) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(SCRIPT, "utf16le").toString("base64"),
      ],
      {
        timeout: 30_000,
        windowsHide: true,
        env: {
          ...process.env,
          DS_DESKTOP: process.env.DATESORT_DESKTOP ?? "",
          DS_NAME: sc.name,
          DS_TARGET: sc.target,
          DS_ROOT: ROOT,
          DS_ICON: sc.icon,
          DS_DESCRIPTION: sc.description,
        },
      },
      (error, stdout, stderr) =>
        resolve({ ok: !error, out: `${stdout}`.trim(), err: `${stderr}`.trim() }),
    );
  });
}

/** Make one icon if it has never been made here. Never throws. */
async function ensureShortcut(sc) {
  try {
    if (process.platform !== "win32") return "skipped: not Windows";
    if (readMarker(sc.marker) !== null)
      return `skipped: the ${sc.label} icon was already made once`;
    if (!existsSync(sc.target))
      return `skipped: ${path.basename(sc.target)} is not in this folder`;
    const r = await runPowerShell(sc);
    const line = r.out.split(/\r?\n/).pop() ?? "";
    if (!r.ok || !/^(created|exists|other) /.test(line)) {
      return `skipped: could not make the ${sc.label} desktop icon (${(r.err || r.out).split(/\r?\n/)[0]})`;
    }
    mkdirSync(path.dirname(sc.marker), { recursive: true });
    writeFileSync(
      sc.marker,
      `${JSON.stringify({ shortcut: line.replace(/^\w+ /, ""), result: line.split(" ")[0], at: new Date().toISOString() }, null, 2)}\n`,
    );
    return line.startsWith("created")
      ? `made a ${sc.label} icon on the desktop`
      : line.startsWith("exists")
        ? `the ${sc.label} desktop icon is already there`
        : `a different ${sc.label} shortcut is already on the desktop; left it alone`;
  } catch (e) {
    return `skipped: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export const ensureDateSortShortcut = () => ensureShortcut(SHORTCUTS.dateSort);
export const ensureControlCenterShortcut = () =>
  ensureShortcut(SHORTCUTS.controlCenter);

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  // One after the other: two PowerShells writing the same desktop at once
  // gain nothing and are harder to read when something goes wrong.
  console.log(`  [ok]    Desktop icon: ${await ensureControlCenterShortcut()}`);
  console.log(`  [ok]    Desktop icon: ${await ensureDateSortShortcut()}`);
}
