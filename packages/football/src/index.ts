/**
 * @hl-bos/football — the football domain, as code.
 *
 * Pure and deterministic: no network, no database, no AI provider, no React.
 * Football FilmStudy AI depends on it, and the rest of the Venuewise athletics
 * products (AthleteHuddle, PlayingTime, HighlightAI) can depend on it without
 * inheriting FilmStudy's schema — which is what keeps "explosive play" meaning
 * one thing across the portfolio.
 */

export * from "./types";
export * from "./vocabulary";
export * from "./situations";
export * from "./grading";
export * from "./tendencies";
export * from "./confidence";
export * from "./search";
