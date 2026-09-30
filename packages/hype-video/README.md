# @hl-bos/hype-video

The engine behind **5-Star Hype Video** (5-Star Sports Media). Pure TypeScript:
no network, no database, no secrets required. The app (`apps/hype-video`) is a
thin shell over it.

## What it does

`generatePackage(request, { writer })` turns athlete details + a template + a
tone into a `HypePackage`:

| Field            | What it is                                                          |
| ---------------- | ------------------------------------------------------------------- |
| `title`          | Hype video title                                                    |
| `script15`       | 15-second script, timestamped lines                                 |
| `script30`       | 30-second script, timestamped lines                                 |
| `voiceover`      | Narration, with a voice direction line                              |
| `socialCaption`  | Post caption                                                        |
| `hashtags`       | Up to 10, CamelCase, no `#`                                         |
| `onScreenText`   | Timed title cards for a 30-second cut                               |
| `videoPrompt`    | Complete instruction for a text/image-to-video service (9:16, 30 s) |
| `musicPrompt`    | Original instrumental track brief — never names an artist or song   |
| `sponsorCallout` | One line, or `null` when no sponsor was entered — never invented    |

## Module map

| File              | Responsibility                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `types.ts`        | Closed vocabularies (templates, tones, output types, statuses) — mirrored by migration 0051 |
| `templates.ts`    | The eight seed templates as creative briefs; music and voice direction by tone              |
| `validation.ts`   | Normalise untrusted form input; field-level problems in plain English                       |
| `writer.ts`       | The built-in **template writer** — deterministic, offline, not AI                           |
| `prompts.ts`      | **AI prompt templates**: the system prompt and per-request prompt                           |
| `provider/`       | The writer boundary (`HypeWriter`), the Claude writer, and `generatePackage()`              |
| `guard.ts`        | Fabrication guard: no numbers, honours or recruiting claims the user didn't enter           |
| `moderation.ts`   | Text screen **placeholder**: profanity, threats, contact details/addresses                  |
| `project.ts`      | Project record, status machine, consent rules, readiness                                    |
| `export.ts`       | `.txt` / `.md` / `.json` package; every format says what wrote it                           |
| `integrations.ts` | Adapter contracts for video, music, voice, payments, media moderation + honest status       |
| `pricing.ts`      | Planned plans, in integer cents — placeholder, nothing charges                              |

## The safety model

`generatePackage()` in `provider/index.ts`:

1. Screens the **input**. Contact details, profanity or threats → `InputRefusedError`; no writer is called.
2. Writes the **template draft** (always — it is the fallback and the model's baseline).
3. Asks the configured model writer, if any. Any failure (no network, rate limit, refusal, bad JSON) is recorded and falls back.
4. **Guards and screens** the model's draft. A failing draft is discarded with the reason recorded in `notes`; the template draft is used.
5. Guards and screens the template draft too; the test suite proves all 8 templates × 6 tones pass with full and with minimal details.

The guard was mutation-tested: planting `"Undefeated. 12-0."` in the writer fails 20 tests.

## Adding an AI vendor

Write one file in `src/provider/` that returns a `HypeWriter`. Reuse
`SYSTEM_PROMPT` and `buildUserPrompt()` from `prompts.ts`. Nothing else
changes: the guard, screen and fallback apply automatically.

The Claude writer uses `claude-opus-5-5` with structured output (zod schema)
and **server-side refusal fallback** (`fallbacks: "default"`) enabled — if the
primary model declines on policy grounds, the API retries on a fallback model
in the same call.

## Next integrations needed for real video / music / voice

Nothing renders media today. Each slot below is an interface in
`integrations.ts`; the app shows its button switched off with the reason until
an adapter is registered.

| Capability       | Consumes                        | Candidates                              | Notes                                                                                                                                                                                |
| ---------------- | ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Video            | `videoPrompt` + uploaded media  | Runway, Pika, Luma, Kling               | Async: `submit` → `poll`. Needs uploaded media reachable by URL → Supabase Storage signed URLs (short-lived). Must not alter the athlete's face/body — keep that line in the prompt. |
| Music            | `musicPrompt`                   | Suno, Udio, Stable Audio                | Check commercial-use licence terms per plan before selling packages. Instrumental only.                                                                                              |
| Voice            | `voiceover` + tone              | ElevenLabs, OpenAI TTS, Azure Speech    | Stock voices only. **No voice cloning of a minor.**                                                                                                                                  |
| Media moderation | uploaded images / frames        | AWS Rekognition, Hive, Cloud Vision     | Run on upload before anything is generated or shared. Today nothing inspects media, and the app says so.                                                                             |
| Payments         | `PLANS`                         | Stripe Checkout + webhooks              | Webhook writes `hype.purchases` / `hype.subscriptions` on the trusted path; only then may a project reach `paid_download_pending`.                                                   |
| Final assembly   | render outputs + `onScreenText` | Shotstack, Creatomate, or ffmpeg worker | Composites clip + music + voice + title cards into the deliverable MP4.                                                                                                              |

Ecosystem hand-off: the JSON export (`format: "5-star-hype-package/v1"`) is the
contract for AthleteHuddle / HomeHuddle / HighlightAI to import a package.

## Tests

`pnpm --filter @hl-bos/hype-video test` — 100 tests.
