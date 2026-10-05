/** Test-only helpers: a fresh database in a temp dir, and real generated photos. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";

import { createAccount } from "./auth-core.ts";
import { openDb, type Db } from "./db-core.ts";

export function freshDb(): { db: Db; dataDir: string } {
  const dataDir = mkdtempSync(path.join(tmpdir(), "jerseysort-"));
  return { db: openDb(path.join(dataDir, "test.db")), dataDir };
}

export function account(
  db: Db,
  email = "coach@example.com",
  org = "West Seneca Football",
) {
  return createAccount(db, {
    email,
    password: "correct horse battery",
    displayName: "Coach",
    organizationName: org,
  });
}

let seed = 0;
/** A real JPEG with a jersey-like shape and number, unique bytes each call. */
export async function jpeg(
  number: string,
  opts: { exifDate?: string } = {},
): Promise<Uint8Array> {
  seed += 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="#2f7d32"/>
    <rect x="300" y="200" width="200" height="300" rx="20" fill="#c62828"/>
    <text x="400" y="400" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="140" fill="#fff">${number}</text>
    <text x="10" y="590" font-size="10" fill="#2f7d33">${seed}</text>
  </svg>`;
  let img = sharp(Buffer.from(svg)).jpeg({ quality: 90 });
  if (opts.exifDate !== undefined) {
    img = img.withExif({
      IFD0: { Make: "Canon", Model: "EOS R6" },
      IFD2: { DateTimeOriginal: opts.exifDate },
    });
  }
  return new Uint8Array(await img.toBuffer());
}
