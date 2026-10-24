// Suggesting each shooting date's sport with Claude. Node only:
// "@hl-bos/date-sort/sport". The ONLY part of DateSort that uses the
// internet, and only when the CEO asks for sport suggestions: small previews
// of a few photos per date go to Anthropic. Nothing here writes a photo.
export {
  checkAnswer,
  checkKey,
  claudeAsker,
  explainClaudeError,
  SPORT_MODEL,
  SPORT_SYSTEM_PROMPT,
} from "./claude";
export type { AskClaude, ClaudeAnswer } from "./claude";
export { PREVIEW_EDGE, previewOf } from "./preview";
export {
  PHOTO_VERDICTS,
  pickSamples,
  SAMPLES_PER_DAY,
  SPORT_LABEL,
  SPORTS,
  tallyGuess,
  withSport,
} from "./sports";
export type { PhotoVerdict, Sport, SportGuess } from "./sports";
export {
  forgetKey,
  loadKey,
  looksLikeKey,
  savedGuess,
  saveGuess,
  saveKey,
} from "./store";
export { sampleKey, suggestSport } from "./suggest";
