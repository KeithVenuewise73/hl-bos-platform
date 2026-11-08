/**
 * The plain rules of an Instagram post: the limits, the two shapes, what makes
 * a caption acceptable, and a starting caption. No image library in here, so
 * the browser-side form can use it too (the picture-making is in
 * ./instagram-core.ts, which is server-only).
 */

/** A carousel holds at most 10 pictures. */
export const MAX_PHOTOS = 10;
/** Instagram's own limits on a caption. */
export const MAX_CAPTION = 2200;
export const MAX_HASHTAGS = 30;

export type Format = "portrait" | "square";
export type Fit = "fill" | "bars";

export const FORMATS: Readonly<
  Record<
    Format,
    { readonly width: number; readonly height: number; readonly label: string }
  >
> = {
  portrait: {
    width: 1080,
    height: 1350,
    label: "Portrait 4:5 (fills the most screen)",
  },
  square: { width: 1080, height: 1080, label: "Square 1:1" },
};

export const FITS: Readonly<Record<Fit, string>> = {
  fill: "Fill the picture (crops the edges)",
  bars: "Keep the whole photo (dark bars if needed)",
};

export const isFormat = (v: unknown): v is Format => v === "portrait" || v === "square";
export const isFit = (v: unknown): v is Fit => v === "fill" || v === "bars";

/** What can go wrong with a caption, in plain words. Empty means fine. */
export function captionProblems(caption: string): string[] {
  const problems: string[] = [];
  const length = [...caption].length;
  if (length > MAX_CAPTION) {
    problems.push(
      `The caption is ${length.toLocaleString("en-US")} characters; Instagram allows ${MAX_CAPTION.toLocaleString("en-US")}.`,
    );
  }
  const tags = hashtagCount(caption);
  if (tags > MAX_HASHTAGS) {
    problems.push(
      `The caption has ${tags} hashtags; Instagram allows ${MAX_HASHTAGS}.`,
    );
  }
  return problems;
}

export function hashtagCount(caption: string): number {
  return (caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** A starting caption for a game. Names and numbers are left for a person to add. */
export function suggestCaption(game: {
  readonly name: string;
  readonly team_name: string;
  readonly opponent: string | null;
  readonly event_date: string;
  readonly location: string | null;
  readonly brand: string;
  readonly dateText: string;
}): string {
  const title =
    game.opponent !== null && game.opponent.trim() !== ""
      ? `${game.team_name} vs ${game.opponent.trim()}`
      : game.name;
  const where =
    game.location !== null && game.location.trim() !== ""
      ? ` · ${game.location.trim()}`
      : "";
  return `${title}\n${game.dateText}${where}\n📸 ${game.brand}`;
}

/**
 * Would this photo have to be enlarged to make the picture (so it comes out a
 * little soft)? Works from the photo's size as shown, after rotation, so a
 * page can warn without making the picture first.
 */
export function wouldEnlarge(
  photoWidth: number,
  photoHeight: number,
  format: Format,
  fit: Fit,
): boolean {
  const { width, height } = FORMATS[format];
  return fit === "fill"
    ? Math.min(photoWidth / width, photoHeight / height) < 1
    : Math.min(width / photoWidth, height / photoHeight) > 1;
}
