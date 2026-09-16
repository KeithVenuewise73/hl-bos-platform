import type { GameEvent } from "./events";

/** Log-building helpers shared by the tests. Not exported from the package. */

export const T0 = Date.parse("2026-09-12T18:00:00.000Z");

export const at = (seconds: number): string =>
  new Date(T0 + seconds * 1000).toISOString();

let counter = 0;
export function resetSeq(): void {
  counter = 0;
}

type Spec =
  | { t: "start"; s: number }
  | { t: "pause"; s: number }
  | { t: "resume"; s: number }
  | { t: "endPeriod"; s: number; period: number }
  | { t: "startPeriod"; s: number; period: number }
  | { t: "in"; s: number; p: string }
  | { t: "out"; s: number; p: string }
  | { t: "end"; s: number };

export const start = (s: number): Spec => ({ t: "start", s });
export const pause = (s: number): Spec => ({ t: "pause", s });
export const resume = (s: number): Spec => ({ t: "resume", s });
export const endPeriod = (s: number, period: number): Spec => ({
  t: "endPeriod",
  s,
  period,
});
export const startPeriod = (s: number, period: number): Spec => ({
  t: "startPeriod",
  s,
  period,
});
export const playerIn = (s: number, p: string): Spec => ({ t: "in", s, p });
export const playerOut = (s: number, p: string): Spec => ({ t: "out", s, p });
export const end = (s: number): Spec => ({ t: "end", s });

export function log(gameId: string, specs: readonly Spec[]): GameEvent[] {
  return specs.map((spec) => {
    const seq = counter++;
    const common = { id: `ev-${gameId}-${seq}`, gameId, at: at(spec.s), seq };
    switch (spec.t) {
      case "start":
        return { ...common, type: "game_started" as const };
      case "pause":
        return { ...common, type: "clock_paused" as const };
      case "resume":
        return { ...common, type: "clock_resumed" as const };
      case "endPeriod":
        return { ...common, type: "period_ended" as const, period: spec.period };
      case "startPeriod":
        return { ...common, type: "period_started" as const, period: spec.period };
      case "in":
        return { ...common, type: "player_in" as const, playerId: spec.p };
      case "out":
        return { ...common, type: "player_out" as const, playerId: spec.p };
      case "end":
        return { ...common, type: "game_ended" as const };
    }
  });
}

/** `now` as an offset in seconds from T0. */
export const now = (seconds: number): number => T0 + seconds * 1000;
