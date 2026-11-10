/**
 * Room for what the iPhone copy brings in, and where it is kept by default.
 * Pure (no disk access), so it is tested directly; free-space.ts does the
 * reading.
 *
 * Why this exists: the videos once defaulted to the laptop's own drive, inside
 * OneDrive. 34.5 GB came across, C: filled up, and Windows stopped the copy
 * with "There is insufficient disk space". Two rules follow:
 *
 *   1. Before copying, compare what is to come with what the drive has, and
 *      stop, copying nothing, if it will not fit.
 *   2. A folder suggested on its own is never on C: and never inside OneDrive,
 *      and a folder already chosen there is warned about, in plain words.
 */

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** Kept free on top of the files themselves: Windows needs room to work in. */
export const SPACE_MARGIN_BYTES = 2 * GB;

/** The drive written as the user sees it: "D:", or a plain name when there is no letter. */
export function driveOf(folder: string): string {
  const m = /^([A-Za-z]:)/.exec(folder.trim());
  return m?.[1] !== undefined ? m[1].toUpperCase() : "that folder's drive";
}

/** "812 MB", "48.2 GB". */
function size(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${Math.max(0, Math.round(bytes / MB)).toLocaleString("en-US")} MB`;
}

export interface SpaceCheck {
  /** False only when the drive's free space is known and is not enough. */
  readonly enough: boolean;
  /** Whether the drive's free space could be read at all. */
  readonly known: boolean;
}

/**
 * Will `needed` bytes fit, with a margin left over? When the free space cannot
 * be read it does NOT block the copy (it says it did not know), because
 * refusing on a guess would stop a copy that would have worked.
 */
export function checkSpace(needed: number, free: number | null): SpaceCheck {
  if (free === null) return { enough: true, known: false };
  return { enough: needed + SPACE_MARGIN_BYTES <= free, known: true };
}

/** One sentence on the room, for the size check and for the refusal. */
export function roomSentence(
  folder: string,
  needed: number,
  free: number | null,
  enough: boolean,
): string {
  const drive = driveOf(folder);
  if (free === null) {
    return `DateSort could not read how much room ${drive} has, so it cannot say whether this will fit.`;
  }
  if (enough) return `${drive} has ${size(free)} free, enough for this.`;
  const short = needed + SPACE_MARGIN_BYTES - free;
  return `This will not fit: it needs ${size(needed)} (and ${size(SPACE_MARGIN_BYTES)} to spare), but ${drive} has only ${size(free)} free. About ${size(short)} more room is needed.`;
}

/** The refusal shown instead of starting a copy that cannot finish. */
export function noRoomMessage(
  folder: string,
  needed: number,
  free: number | null,
): string {
  return `Nothing was copied. ${roomSentence(folder, needed, free, false)} Choose a folder on a drive with more room (press "change"), or free some space, then press the button again. Nothing on the iPhone was touched.`;
}

/**
 * A plain warning about a folder that is a poor home for large files, or null.
 * C: is the laptop's own drive and fills up; OneDrive would try to upload every
 * file to the cloud.
 */
export function folderWarning(
  folder: string,
  plural: "photos" | "videos",
): string | null {
  if (/[\\/]OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(folder)) {
    return `This folder is inside OneDrive, which will try to upload every one of these ${plural} to the cloud and use up your OneDrive space. Press "change" and choose a folder outside OneDrive.`;
  }
  if (/^[Cc]:/.test(folder.trim())) {
    return `This folder is on the laptop's own drive (C:), which fills up quickly. Press "change" and choose a folder on an external drive.`;
  }
  return null;
}

/**
 * Where the videos go when none has been chosen: beside the photos folder
 * ("D:\Iphone Photos" gives "D:\Iphone Videos"), unless that would be a poor
 * place for them (C: or OneDrive), in which case null, and the user chooses.
 */
export function defaultVideoFolder(
  photosFolder: string | null | undefined,
): string | null {
  if (typeof photosFolder !== "string" || photosFolder.trim() === "") return null;
  const trimmed = photosFolder.trim().replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") || !trimmed.includes("/") ? "\\" : "/";
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (cut <= 0) return null;
  const parent = trimmed.slice(0, cut);
  // "D:" alone is the top of a drive: fine as a parent, the folder is made inside it.
  if (parent === "") return null;
  const candidate = `${parent}${sep}Iphone Videos`;
  return folderWarning(candidate, "videos") === null ? candidate : null;
}

/**
 * Kept free while a copy is running, on top of what has been copied. Bigger
 * than the margin before a copy because one file in flight (a whole hockey
 * game is over 5 GB) is not counted yet.
 */
export const LIVE_MARGIN_BYTES = 8 * GB;

/** When the phone gave no sizes: say so, and say what protects the drive instead. */
export function unknownSizeSentence(folder: string, free: number | null): string {
  const drive = driveOf(folder);
  const room = free === null ? "" : ` ${drive} has ${size(free)} free.`;
  return `The phone did not report how big these files are, so DateSort cannot say whether they will fit.${room} It will stop by itself if ${drive} gets nearly full.`;
}

/** Shown when a copy was stopped part-way to keep the drive from filling up. */
export function driveNearlyFullMessage(
  folder: string,
  copiedBytes: number,
  left: number,
): string {
  const drive = driveOf(folder);
  return `Stopped to keep ${drive} from filling up: ${size(copiedBytes)} has been copied so far and ${drive} has only ${size(Math.max(0, left))} left. Everything already copied is kept, and nothing on the iPhone was touched. Free some space or choose a folder on a drive with more room (press "change"), then press the button again: files already copied are skipped.`;
}
