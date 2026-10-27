/**
 * What a file is, decided by its first bytes — never by its name alone.
 *
 * A renamed .exe is not a JPEG because its name ends in .jpg, and a Canon
 * RAW file renamed .jpg is still a RAW file. The name is used only to explain
 * a mismatch ("named .jpg but is not a JPEG image").
 */

/**
 * Every kind of file DateSort sorts. "mov" and "mp4" are videos (iPhones
 * film MOV); the code calls them all "photos" where the difference does not
 * matter, and asks isVideo() where it does.
 */
export type PhotoFormat = "jpeg" | "png" | "heic" | "cr2" | "cr3" | "mov" | "mp4";

/** Every format DateSort counts, in the order the report lists them. */
export const PHOTO_FORMATS: readonly PhotoFormat[] = [
  "jpeg",
  "png",
  "heic",
  "cr2",
  "cr3",
  "mov",
  "mp4",
];

/** How each format is named on screen. */
export const FORMAT_LABEL: Readonly<Record<PhotoFormat, string>> = {
  jpeg: "JPG",
  png: "PNG",
  heic: "HEIC",
  cr2: "CR2",
  cr3: "CR3",
  mov: "MOV",
  mp4: "MP4",
};

export function isRaw(format: PhotoFormat): boolean {
  return format === "cr2" || format === "cr3";
}

export function isVideo(format: PhotoFormat): boolean {
  return format === "mov" || format === "mp4";
}

/** How many leading bytes `sniff` needs. */
export const SNIFF_BYTES = 16;

function ascii(bytes: Uint8Array, from: number, to: number): string {
  if (bytes.length < to) return "";
  return String.fromCharCode(...bytes.subarray(from, to));
}

/** HEIF brands a still photo can carry (iPhone writes "heic"). */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

/** MP4 brands from phones, cameras and editors. */
const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4VP",
  "MSNV",
  "XAVC",
  "3gp4",
  "3gp5",
  "3gp6",
  "3g2a",
]);

/** The format these bytes are, or null when they are none of ours. */
export function sniff(head: Uint8Array): PhotoFormat | null {
  // Canon RAW first: a CR2 is also a TIFF, and a CR3 is also an ISO media file.
  const tiff =
    (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) ||
    (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a);
  if (tiff && ascii(head, 8, 10) === "CR") return "cr2";
  const box = ascii(head, 4, 8);
  const brand = ascii(head, 8, 12);
  if (box === "ftyp" && brand === "crx ") return "cr3";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "jpeg";
  }
  if (
    head.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b)
  ) {
    return "png";
  }
  if (box === "ftyp" && HEIF_BRANDS.has(brand)) return "heic";
  // Videos. QuickTime (iPhone) says "qt  "; MP4 has many brands.
  if (box === "ftyp" && brand === "qt  ") return "mov";
  if (box === "ftyp" && MP4_BRANDS.has(brand)) return "mp4";
  // Older QuickTime files start straight with a movie box, no ftyp.
  if (box === "moov" || box === "wide" || box === "mdat") return "mov";
  return null;
}

export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

/** What each extension promises, to explain a file that breaks the promise. */
const EXTENSION_FORMAT: Readonly<Record<string, PhotoFormat>> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  heic: "heic",
  heif: "heic",
  cr2: "cr2",
  cr3: "cr3",
  mov: "mov",
  mp4: "mp4",
  m4v: "mp4",
};

/** Files Windows, macOS and cameras leave in folders; never photos. */
const SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", ".ds_store", "ehthumbs.db"]);

export type Classified =
  | { readonly kind: "photo"; readonly format: PhotoFormat }
  | { readonly kind: "unsupported"; readonly reason: string };

/** What one file is, from its name, size and first SNIFF_BYTES bytes. */
export function classify(name: string, size: number, head: Uint8Array): Classified {
  const base = baseName(name).toLowerCase();
  if (SYSTEM_FILES.has(base) || base.startsWith("._")) {
    return { kind: "unsupported", reason: "System file, not a photo" };
  }
  const format = sniff(head);
  if (format !== null) return { kind: "photo", format };
  if (size === 0) return { kind: "unsupported", reason: "Empty file" };
  const ext = extensionOf(name);
  const promised = EXTENSION_FORMAT[ext];
  if (promised !== undefined) {
    return {
      kind: "unsupported",
      reason: `Named .${ext} but is not ${/^M/.test(FORMAT_LABEL[promised]) ? "an" : "a"} ${FORMAT_LABEL[promised]} file`,
    };
  }
  return {
    kind: "unsupported",
    reason: ext === "" ? "Not a photo" : `.${ext} files are not photos DateSort reads`,
  };
}
