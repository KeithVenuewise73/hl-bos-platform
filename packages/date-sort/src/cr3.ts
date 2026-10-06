/**
 * Canon CR3 capture dates, read without decoding (or changing) anything.
 *
 * A CR3 is an ISO base media file (the MP4 family). Canon keeps its EXIF in
 * a private box inside `moov`:
 *
 *   ftyp "crx "
 *   moov
 *     uuid 85c0b687-820f-11e0-8111-f4ce462b6a48   (Canon)
 *       CMT1   TIFF block: IFD0 (camera make, model, ModifyDate)
 *       CMT2   TIFF block: the EXIF IFD (DateTimeOriginal, CreateDate)
 *       CMT3, CMT4, THMB ...
 *   mdat   the image itself (never read)
 *
 * This walks box headers only — a few dozen bytes each — then reads the two
 * small CMT blocks. The image data is never touched. It reads through a
 * `ByteSource`, which can only read.
 */

import { boxesIn, type ByteSource } from "./isobmff";
import { readTiffDates, type TiffDates } from "./tiff";

const CANON_UUID = "85c0b687820f11e08111f4ce462b6a48";
/** A real CMT block is a few KB; refuse to read anything absurd. */
const MAX_CMT_BYTES = 1024 * 1024;

/** The dates in a CR3's Canon metadata; {} when there are none to be found. */
export async function readCr3Dates(src: ByteSource): Promise<TiffDates> {
  const top = await boxesIn(src, 0, src.size);
  const moov = top.find((b) => b.type === "moov");
  if (moov === undefined) return {};
  const canon = (await boxesIn(src, moov.body, moov.end)).find(
    (b) => b.type === "uuid" && b.uuid === CANON_UUID,
  );
  if (canon === undefined) return {};
  const inner = await boxesIn(src, canon.body, canon.end);
  const dates: TiffDates = {};
  // CMT2 (the EXIF IFD) is where Canon puts both dates; CMT1 is checked too
  // in case a body ever writes them there.
  for (const name of ["CMT2", "CMT1"]) {
    const box = inner.find((b) => b.type === name);
    if (box === undefined || box.end - box.body > MAX_CMT_BYTES) continue;
    const found = readTiffDates(await src.read(box.body, box.end - box.body));
    dates.dateTimeOriginal ??= found.dateTimeOriginal;
    dates.createDate ??= found.createDate;
  }
  return dates;
}
