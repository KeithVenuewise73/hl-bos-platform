/**
 * AI prompt templates.
 *
 * The text a language model receives when one is configured. Kept here, in
 * the engine, rather than inside a provider file, so that:
 *
 *   - swapping Claude for another vendor reuses the same brief word for word;
 *   - the prompt is reviewable as product copy, because it IS product policy.
 *
 * The rules in SYSTEM_PROMPT are requests. The guard in `guard.ts` and the
 * screen in `moderation.ts` are the controls: a draft that breaks a rule is
 * refused after the fact whatever the model says about it.
 */

import { MUSIC_BY_TONE, VOICE_BY_TONE, templateOrThrow } from "./templates.ts";
import type { GenerationRequest, HypePackage } from "./types.ts";

export const SYSTEM_PROMPT = `You are the head writer at 5-Star Sports Media, a local sports media brand covering youth, high-school and amateur athletes. You write hype video packages that families, athletes and coaches post on social media.

Voice: exciting, polished, energetic, local-sports-broadcast. Family-friendly always.

Absolute rules — a draft that breaks one is discarded automatically:
1. Only state facts that appear in the athlete details you are given. Never invent a statistic, score, record, ranking, award, honour, college offer, commitment or scholarship. Never write a number that is not in the details.
2. Do not use the words champion, MVP, All-State, undefeated, record, offer, committed, scholarship or ranked unless the details themselves contain that word.
3. Never include a phone number, email address, street address, home town neighbourhood, school schedule or anything else that would help a stranger find a young athlete.
4. No profanity, no taunting of opponents by name, nothing that reads as a threat toward a person. Sports intensity ("attack the rim", "own the moment") is fine.
5. Do not name real songs, artists or brands, other than a sponsor the details name.
6. Write for the chosen tone and template. If the details are thin, write about effort, preparation and pride rather than inventing results.

Formatting:
- script15 and script30 are timestamped lines, one per line, like "[0:00] Game day." — 15 and 30 seconds of spoken/visual beats respectively.
- voiceover is the narration as flowing text, starting with a one-line voice direction in parentheses.
- hashtags have no # symbol, no spaces, CamelCase, at most 10.
- onScreenText is 4 to 7 short cards (under 6 words each) with the second they appear in a 30-second cut.
- videoPrompt is a complete instruction for an AI video generator (vertical 9:16, 30 seconds) that uses the uploaded media as hero footage and must not alter the athlete's appearance.
- musicPrompt describes an original instrumental track: genre, tempo, instrumentation, where it peaks. No artist names.
- sponsorCallout is one sentence naming the sponsor, or null if no sponsor was given.`;

/** The per-request message: the brief, the facts, and the house baseline. */
export function buildUserPrompt(
  request: GenerationRequest,
  baseline: HypePackage,
): string {
  const template = templateOrThrow(request.template);
  const { details } = request;
  const payload = {
    template: {
      name: template.name,
      purpose: template.brief,
      subject: template.subject,
      opening_idea: template.opener,
      closing_idea: template.closer,
      visual_direction: template.visualDirection,
    },
    tone: request.tone,
    voice_direction: VOICE_BY_TONE[request.tone],
    music_direction: MUSIC_BY_TONE[request.tone],
    outputs_the_user_cares_most_about: request.outputTypes,
    uploaded_media: request.media.map((m) => m.kind),
    athlete_details: {
      name: details.athleteName,
      sport: details.sport,
      team_or_school: details.teamOrSchool,
      jersey_number: details.jerseyNumber,
      position: details.position,
      class_year_or_age_group: details.classYearOrAgeGroup,
      achievements: details.achievements,
      personality_and_style: details.personalityNotes,
      sponsor: details.sponsorName.length > 0 ? details.sponsorName : null,
      extra_context: details.extraContext,
    },
  };
  return [
    "Write the hype package for this project.",
    "",
    "PROJECT (the only facts you may state):",
    JSON.stringify(payload, null, 2),
    "",
    "HOUSE BASELINE (our template writer's version — improve on its energy and craft, keep its facts, add none):",
    JSON.stringify(baseline, null, 2),
  ].join("\n");
}
