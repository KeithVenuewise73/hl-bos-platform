/**
 * The hand-off from DateSort: a game's date folder brought into an event.
 * Real folders, real JPEGs, a real database in a temp dir.
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  importFolder,
  ImportError,
  newProgress,
  readImportFolder,
} from "./folder-import.ts";
import { safeNext } from "./next-path.ts";
import { createEvent } from "./repo/events.ts";
import { dateSortKeyFile, readSharedKey } from "./shared-key.ts";
import { account, freshDb, jpeg } from "./test-helpers.ts";

function fingerprint(dir: string): string {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const f = path.join(e.parentPath, e.name);
      const st = statSync(f);
      return `${path.relative(dir, f)}|${st.size}|${st.mtimeMs}|${createHash("sha256").update(readFileSync(f)).digest("hex")}`;
    })
    .sort()
    .join("\n");
}

async function gameFolder(): Promise<string> {
  const dir = path.join(
    mkdtempSync(path.join(tmpdir(), "datesort-game-")),
    "2026-01-13 - Basketball",
  );
  mkdirSync(dir, { recursive: true });
  for (const n of ["8000", "8001", "8002"]) {
    writeFileSync(
      path.join(dir, `IMG_${n}.JPG`),
      await jpeg(n.slice(-2), { exifDate: "2026:01:13 18:00:00" }),
    );
    writeFileSync(path.join(dir, `IMG_${n}.CR2`), "raw bytes");
  }
  writeFileSync(path.join(dir, "Thumbs.db"), "x");
  mkdirSync(path.join(dir, "edited"));
  writeFileSync(path.join(dir, "edited", "IMG_9999.JPG"), await jpeg("99"));
  return dir;
}

describe("reading a game folder", () => {
  it("lists the JPGs directly inside, counts RAW and others, ignores subfolders", async () => {
    const dir = await gameFolder();
    const c = await readImportFolder(dir);
    expect(c.photos).toEqual(["IMG_8000.JPG", "IMG_8001.JPG", "IMG_8002.JPG"]);
    expect(c.raw).toBe(3);
    expect(c.other).toBe(1);
  });

  it("refuses a relative path, a missing folder and a file, in plain words", async () => {
    await expect(readImportFolder("photos")).rejects.toThrow(ImportError);
    await expect(
      readImportFolder(path.join(tmpdir(), "no-such-folder-x")),
    ).rejects.toThrow(/not found/);
    const dir = await gameFolder();
    await expect(readImportFolder(path.join(dir, "Thumbs.db"))).rejects.toThrow(
      /file, not a folder/,
    );
  });
});

describe("bringing a game folder into an event", () => {
  it("adds every photo, queued for reading, and leaves the folder exactly as it was", async () => {
    const { db, dataDir } = freshDb();
    const { userId, organizationId: org } = account(db);
    const eventId = createEvent(db, org, userId, {
      name: "Zac K",
      sport: "Basketball",
      teamName: "West Seneca",
      opponent: "",
      eventDate: "2026-01-13",
      location: "",
      season: "",
      notes: "",
    });
    const dir = await gameFolder();
    const before = fingerprint(dir);
    const contents = await readImportFolder(dir);
    let calls = 0;
    const p = await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents,
      progress: newProgress(contents),
      onPhoto: () => (calls += 1),
    });
    expect(p).toMatchObject({
      total: 3,
      done: 3,
      added: 3,
      alreadyIn: 0,
      failed: 0,
      finished: true,
    });
    expect(calls).toBe(3);
    const rows = db.all<{ original_filename: string; status: string }>(
      "select original_filename, status from photos where event_id = :e order by original_filename",
      { e: eventId },
    );
    expect(rows).toEqual([
      { original_filename: "IMG_8000.JPG", status: "queued" },
      { original_filename: "IMG_8001.JPG", status: "queued" },
      { original_filename: "IMG_8002.JPG", status: "queued" },
    ]);
    expect(fingerprint(dir)).toBe(before);

    // Pressing it again (or an import cut short and restarted) adds nothing twice.
    const again = await importFolder(db, dataDir, {
      org,
      userId,
      eventId,
      contents,
      progress: newProgress(contents),
    });
    expect(again).toMatchObject({ added: 0, alreadyIn: 3, failed: 0 });
    expect(db.get<{ n: number }>("select count(*) as n from photos", {})?.n).toBe(3);
  });
});

describe("signing in on the way to an import", () => {
  it("returns only to a page of this app", () => {
    expect(safeNext("/import?folder=D%3A%5Cx")).toBe("/import?folder=D%3A%5Cx");
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil",
      "import",
      "",
      null,
      "/a\nb",
    ]) {
      expect(safeNext(bad), String(bad)).toBeNull();
    }
  });
});

describe("the Claude key saved in DateSort", () => {
  it("is found where DateSort keeps it, and only used if it is a key", () => {
    expect(dateSortKeyFile("C:\\Users\\keith", "win32")).toBe(
      path.join("C:\\Users\\keith", "AppData", "Local", "DateSort", "claude-key.txt"),
    );
    const dir = mkdtempSync(path.join(tmpdir(), "js-key-"));
    const file = path.join(dir, "claude-key.txt");
    expect(readSharedKey(file)).toBeUndefined();
    writeFileSync(file, "not a key\n");
    expect(readSharedKey(file)).toBeUndefined();
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345";
    writeFileSync(file, `${key}\n`);
    expect(readSharedKey(file)).toBe(key);
  });
});
