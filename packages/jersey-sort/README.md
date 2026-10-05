# @hl-bos/jersey-sort

The JerseySort AI engine: every decision the product makes about a photo,
with no database, filesystem or image decoding, so all of it is testable.

| File            | Decides                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context.ts`    | Which numbers in a photo are jersey numbers. A provider that says "that 30 is a yard marker" is believed and the reading refused; a provider that cannot tell (`location: "unknown"`, i.e. plain OCR) has its readings discounted by position (scoreboard edge, tiny digits, low yard numbers) and **capped at 80%**, so OCR alone never files a photo without review. |
| `confidence.ts` | High / medium / low bands against configurable thresholds (default 85 / 60). Bands are computed, never stored.                                                                                                                                                                                                                                                         |
| `review.ts`     | When a photo needs a person, and which jersey galleries it belongs in. The app's SQL is held to these functions by its tests.                                                                                                                                                                                                                                          |
| `numbers.ts`    | What a jersey number is: `0`–`99` and `00`, kept as text because 0 and 00 are different jerseys.                                                                                                                                                                                                                                                                       |
| `search.ts`     | `24`, `#24`, `Dominic Herman`, `October 3`, `10/3/26` → numbers, dates and words.                                                                                                                                                                                                                                                                                      |
| `zip.ts`        | Streaming STORE-only ZIP for downloads; refuses to exceed 4 GB rather than emit a corrupt archive.                                                                                                                                                                                                                                                                     |
| `analyze.ts`    | One photo through one provider: analyze → interpret → status.                                                                                                                                                                                                                                                                                                          |
| `provider/`     | The `ImageAnalysisProvider` boundary and the Claude vision provider.                                                                                                                                                                                                                                                                                                   |

## Adding a provider

Implement `ImageAnalysisProvider` (`provider/types.ts`): `info` (id, model,
label, method, and whether it `understandsContext`) and
`analyze(image) → ProviderResult`. Report every number you see with what it
is printed on, or `"unknown"`. Nothing else changes: interpretation, bands,
review and galleries are shared. Google Cloud Vision, Gemini, Rekognition or a
YOLO jersey detector is one new file.

The app's local OCR provider (Tesseract) lives in
`apps/jersey-sort/src/lib/ocr.ts` because it needs image tooling.

## Claude vision

`createClaudeVisionProvider({ apiKey, model? })`: one structured-output call
per photo (zod-validated), server-side refusal fallback on, `effort: medium`.
A refusal, a cut-off answer or a malformed one is an error — the photo is
marked failed — never an empty result. Tested with an injected client; it has
**not** been run against the live API (no key in this environment).
