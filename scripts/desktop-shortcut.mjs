#!/usr/bin/env node
// Put a DateSort icon on the Windows desktop, ONCE.
//
// The first time HL-BOS starts on a computer (from the Control Center or
// from DateSort.bat) this makes "DateSort" on the desktop: double-click it
// and DateSort starts and opens. After that it never makes the icon again,
// so deleting the icon is a choice that sticks.
//
// "Once" is remembered in .hlbos/desktop-shortcut.json, which is gitignored
// on purpose: the updater refuses to update a folder with stray files in it,
// so a tracked-looking file here would silently stop updates arriving.
//
// It never blocks startup and never throws: any problem is one line of
// output and startup carries on. Off Windows it does nothing.
//
// Paths go to PowerShell as environment variables, never inside the script
// text, so a folder name with quotes or spaces cannot change what runs.
//
// Usage: node scripts/desktop-shortcut.mjs   (prints one line, exits 0)
//   env DATESORT_DESKTOP  desktop folder to use instead of the real one (tests)
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MARKER = path.join(ROOT, ".hlbos", "desktop-shortcut.json");
export const TARGET = path.join(ROOT, "scripts", "DateSort.bat");
export const ICON = path.join(ROOT, "scripts", "assets", "datesort.ico");
export const NAME = "DateSort.lnk";

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
  "$s.Description = 'DateSort - organize camera photos by the day they were taken'",
  "$s.Save()",
  '"created $lnk"',
].join("\n");

function readMarker() {
  try {
    return JSON.parse(readFileSync(MARKER, "utf8"));
  } catch {
    return null;
  }
}

function runPowerShell() {
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
          DS_NAME: NAME,
          DS_TARGET: TARGET,
          DS_ROOT: ROOT,
          DS_ICON: ICON,
        },
      },
      (error, stdout, stderr) =>
        resolve({ ok: !error, out: `${stdout}`.trim(), err: `${stderr}`.trim() }),
    );
  });
}

/** Make the icon if it has never been made here. Never throws. */
export async function ensureDateSortShortcut() {
  try {
    if (process.platform !== "win32") return "skipped: not Windows";
    if (readMarker() !== null)
      return "skipped: the DateSort icon was already made once";
    if (!existsSync(TARGET)) return "skipped: DateSort.bat is not in this folder";
    const r = await runPowerShell();
    const line = r.out.split(/\r?\n/).pop() ?? "";
    if (!r.ok || !/^(created|exists|other) /.test(line)) {
      return `skipped: could not make the desktop icon (${(r.err || r.out).split(/\r?\n/)[0]})`;
    }
    mkdirSync(path.dirname(MARKER), { recursive: true });
    writeFileSync(
      MARKER,
      `${JSON.stringify({ shortcut: line.replace(/^\w+ /, ""), result: line.split(" ")[0], at: new Date().toISOString() }, null, 2)}\n`,
    );
    return line.startsWith("created")
      ? "made a DateSort icon on the desktop"
      : line.startsWith("exists")
        ? "the DateSort desktop icon is already there"
        : "a different DateSort shortcut is already on the desktop; left it alone";
  } catch (e) {
    return `skipped: ${e instanceof Error ? e.message : String(e)}`;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(`  [ok]    Desktop icon: ${await ensureDateSortShortcut()}`);
}
