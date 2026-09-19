/**
 * Highlight reel assembly (brief sections 21, 22, 23).
 *
 * A reel is an ordered list of decisions, not a video file. This module makes
 * those decisions — which clips, in what order, with what cards, to what total
 * length — and the renderer turns them into frames. Keeping them separate means
 * a reel can be reordered, re-scored and re-exported without re-running a single
 * second of computer vision.
 *
 * ORDER. Chronological by default, because a game has a narrative and coaches
 * watch film in order. Ranked order is available and is what recruiting reels
 * use, where the first eight seconds decide whether the rest gets watched.
 *
 * SEASON MODE (section 23) is the same assembly over clips from several games,
 * with one additional rule: no single game may dominate. A ten-game season reel
 * built purely by score routinely returns nine clips from the one blowout where
 * the athlete played the whole second half. `maxPerGame` prevents that.
 */

import type { ClipWindow, HighlightCandidate, ReelProfileCard } from "./types";
import { rankCandidates } from "./highlight";

export type ReelMode = "game" | "season";
export type ReelOrder = "chronological" | "ranked";

export interface ReelClip {
  readonly clipId: string;
  readonly candidateId: string;
  readonly gameId: string;
  readonly playId: string;
  readonly window: ClipWindow;
  readonly durationSeconds: number;
  readonly score: number;
  readonly title: string;
  readonly starred: boolean;
}

export interface ReelCard {
  readonly kind: "opening" | "closing";
  readonly headline: string;
  readonly lines: readonly string[];
  readonly durationSeconds: number;
}

export interface Reel {
  readonly mode: ReelMode;
  readonly opening: ReelCard | null;
  readonly clips: readonly ReelClip[];
  readonly closing: ReelCard | null;
  readonly totalSeconds: number;
  /** Clips dropped by a limit, and why. Shown to the user; never silent. */
  readonly omitted: ReadonlyArray<{ candidateId: string; reason: string }>;
}

export interface ReelInput {
  readonly candidateId: string;
  readonly gameId: string;
  readonly playId: string;
  readonly window: ClipWindow;
  readonly score: number;
  readonly title: string;
  readonly starred?: boolean;
  /** Chronological key across games. Falls back to window start within a game. */
  readonly sortKey?: number;
}

export interface ReelOptions {
  readonly mode: ReelMode;
  readonly order?: ReelOrder;
  readonly profile: ReelProfileCard;
  readonly openingCardSeconds?: number;
  readonly closingCardSeconds?: number;
  readonly includeOpeningCard?: boolean;
  readonly includeClosingCard?: boolean;
  /** Hard cap on reel length. Recruiting coordinators stop watching at ~4 min. */
  readonly maxTotalSeconds?: number;
  /** Season mode only: most clips any single game may contribute. */
  readonly maxPerGame?: number;
  readonly maxClips?: number;
}

const REEL_DEFAULTS = {
  order: "chronological" as ReelOrder,
  openingCardSeconds: 3,
  closingCardSeconds: 3,
  includeOpeningCard: true,
  includeClosingCard: true,
};

/**
 * Build the reel.
 *
 * Starred clips are never dropped by a length or per-game limit. A star is a
 * human saying "this one matters", and an automatic budget silently discarding
 * it is the system overruling the user about their own child's film.
 */
export function assembleReel(inputs: readonly ReelInput[], opts: ReelOptions): Reel {
  const o = { ...REEL_DEFAULTS, ...opts };
  const omitted: Array<{ candidateId: string; reason: string }> = [];

  // Rank once; every limit below consumes this order so the best survive.
  // Reuses the engine's own ranking rather than re-sorting here, so the reel's
  // order can never disagree with the order the editor displayed.
  const rankable: HighlightCandidate[] = inputs.map((i) => ({
    candidateId: i.candidateId,
    playId: i.playId,
    window: i.window,
    involvement: 0,
    score: i.score,
    events: [],
    reasons: [],
    reviewRequired: false,
  }));
  const ranked = rankCandidates(rankable);
  const byId = new Map(inputs.map((i) => [i.candidateId, i] as const));
  const orderedInputs = ranked
    .map((r) => byId.get(r.candidateId))
    .filter((x): x is ReelInput => x !== undefined);

  // --- Per-game cap (season mode) -----------------------------------------
  let kept: ReelInput[] = [];
  if (o.mode === "season" && o.maxPerGame !== undefined) {
    const counts = new Map<string, number>();
    for (const input of orderedInputs) {
      const used = counts.get(input.gameId) ?? 0;
      if (!(input.starred ?? false) && used >= o.maxPerGame) {
        omitted.push({
          candidateId: input.candidateId,
          reason: `Already using ${o.maxPerGame} clips from this game.`,
        });
        continue;
      }
      counts.set(input.gameId, used + 1);
      kept.push(input);
    }
  } else {
    kept = [...orderedInputs];
  }

  // --- Clip count cap -------------------------------------------------------
  if (o.maxClips !== undefined && kept.length > o.maxClips) {
    const trimmed: ReelInput[] = [];
    for (const input of kept) {
      if (trimmed.length < o.maxClips || (input.starred ?? false)) trimmed.push(input);
      else
        omitted.push({
          candidateId: input.candidateId,
          reason: `Reel is limited to ${o.maxClips} clips.`,
        });
    }
    kept = trimmed;
  }

  // --- Duration cap ---------------------------------------------------------
  const cardSeconds =
    (o.includeOpeningCard ? o.openingCardSeconds : 0) +
    (o.includeClosingCard ? o.closingCardSeconds : 0);
  if (o.maxTotalSeconds !== undefined) {
    const budget = Math.max(0, o.maxTotalSeconds - cardSeconds);
    let used = 0;
    const within: ReelInput[] = [];
    // Starred clips claim their time first, so a budget can never evict them.
    for (const input of [...kept].sort(
      (a, b) => Number(b.starred ?? false) - Number(a.starred ?? false),
    )) {
      const d = duration(input.window);
      if (used + d <= budget || (input.starred ?? false)) {
        used += d;
        within.push(input);
      } else
        omitted.push({
          candidateId: input.candidateId,
          reason: `Reel is limited to ${o.maxTotalSeconds}s.`,
        });
    }
    kept = kept.filter((k) => within.includes(k));
  }

  // --- Final order ----------------------------------------------------------
  const finalOrder =
    o.order === "ranked" ? kept : [...kept].sort((a, b) => sortKeyOf(a) - sortKeyOf(b));

  const clips: ReelClip[] = finalOrder.map((input, i) => ({
    clipId: `clip-${i + 1}`,
    candidateId: input.candidateId,
    gameId: input.gameId,
    playId: input.playId,
    window: input.window,
    durationSeconds: duration(input.window),
    score: input.score,
    title: input.title,
    starred: input.starred ?? false,
  }));

  const opening: ReelCard | null = o.includeOpeningCard
    ? {
        kind: "opening",
        headline: o.profile.name.toUpperCase(),
        lines: [
          `#${o.profile.number}`,
          o.profile.team.toUpperCase(),
          o.profile.positions.toUpperCase(),
          o.profile.season,
        ],
        durationSeconds: o.openingCardSeconds,
      }
    : null;

  const closing: ReelCard | null = o.includeClosingCard
    ? {
        kind: "closing",
        headline: o.profile.name.toUpperCase(),
        lines: [
          `#${o.profile.number}`,
          o.mode === "season"
            ? `${o.profile.season} SEASON HIGHLIGHTS`
            : `${o.profile.season} GAME HIGHLIGHTS`,
        ],
        durationSeconds: o.closingCardSeconds,
      }
    : null;

  const totalSeconds =
    clips.reduce((a, c) => a + c.durationSeconds, 0) +
    (opening?.durationSeconds ?? 0) +
    (closing?.durationSeconds ?? 0);

  return { mode: o.mode, opening, clips, closing, totalSeconds, omitted };
}

function duration(w: ClipWindow): number {
  return Math.max(0, w.endSeconds - w.startSeconds);
}

function sortKeyOf(input: ReelInput): number {
  return input.sortKey ?? input.window.startSeconds;
}

/**
 * The season summary the brief shows on the season screen.
 *
 * Every field is a count of something real. There is deliberately no
 * "estimated" or "projected" number here: a season page that says
 * "642 plays analysed" when it analysed 400 is the kind of lie that is never
 * caught and never forgiven.
 */
export interface SeasonSummary {
  readonly games: number;
  readonly playsAnalyzed: number;
  readonly playerAppearances: number;
  readonly candidateHighlights: number;
  readonly topHighlights: number;
}

export function summarizeSeason(
  perGame: ReadonlyArray<{
    playsAnalyzed: number;
    playerAppearances: number;
    candidates: number;
  }>,
  topHighlights: number,
): SeasonSummary {
  return {
    games: perGame.length,
    playsAnalyzed: perGame.reduce((a, g) => a + g.playsAnalyzed, 0),
    playerAppearances: perGame.reduce((a, g) => a + g.playerAppearances, 0),
    candidateHighlights: perGame.reduce((a, g) => a + g.candidates, 0),
    topHighlights,
  };
}
