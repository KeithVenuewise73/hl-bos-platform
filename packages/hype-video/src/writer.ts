/**
 * The built-in template writer.
 *
 * Deterministic, offline, no key. Given the same details, template and tone it
 * writes the same package every time, which is what makes it testable and
 * what makes it a safe fallback when a model is unavailable or its draft is
 * refused by the guard.
 *
 * It is a TEMPLATE writer and is labelled as one wherever its output appears.
 * It is not AI and the product never calls it AI.
 *
 * The one rule it lives by: it only states facts the user entered. Tone lines
 * are about effort and feeling ("Built by the work nobody sees"), never about
 * results ("Undefeated"), so a thin form produces a general video rather than
 * an invented one.
 */

import {
  MUSIC_BY_TONE,
  VOICE_BY_TONE,
  templateOrThrow,
  type HypeTemplate,
} from "./templates.ts";
import type {
  AthleteDetails,
  GenerationRequest,
  HypePackage,
  OnScreenBeat,
  TemplateKey,
  Tone,
} from "./types.ts";

/** Two lines per tone: one for the 15-second cut, both for the 30. */
const TONE_LINES: Readonly<Record<Tone, readonly [string, string]>> = {
  cinematic: [
    "Every rep. Every early morning.",
    "This is where it all comes together.",
  ],
  aggressive: ["No days off. No excuses.", "Pressure is a privilege."],
  inspirational: [
    "Built by the work nobody sees.",
    "Chasing the next level, every single day.",
  ],
  emotional: ["Every early practice. Every ride home.", "All of it mattered."],
  fun: ["Somebody call the highlight desk.", "The energy is unmatched."],
  professional: [
    "Consistent. Coachable. Competitive.",
    "Ready for the next level of competition.",
  ],
};

const TITLE: Readonly<Record<TemplateKey, string>> = {
  game_day: "Game Day: {name}",
  senior_night: "Senior Night: Honoring {name}",
  athlete_spotlight: "Spotlight: {name}",
  recruiting_intro: "{name} | {position} | {class} | Recruiting Intro",
  championship_recap: "{team}: Championship Recap",
  birthday_tribute: "Happy Birthday, {name}!",
  team_intro: "This Is {team}",
  player_of_the_game: "Player of the Game: {name}",
};

interface Slots {
  readonly name: string;
  readonly team: string;
  readonly sport: string;
  readonly jersey: string;
  readonly position: string;
  readonly class: string;
}

function slotsFor(details: AthleteDetails, template: HypeTemplate): Slots {
  const team = details.teamOrSchool;
  return {
    name: template.subject === "team" ? team : details.athleteName,
    team,
    sport: details.sport,
    jersey: details.jerseyNumber,
    position: details.position,
    class: details.classYearOrAgeGroup,
  };
}

/**
 * Fill `{slot}` placeholders. A missing value removes the placeholder AND the
 * punctuation it was glued to, so "#{jersey} · {position}" with no jersey
 * reads "Guard", not "# · Guard".
 */
export function fill(pattern: string, slots: Slots): string {
  // U+E000 (private use) marks an empty slot while punctuation around it is
  // cleaned up. It cannot occur in typed input: normalizeDetails() only ever
  // passes through what a form field sends, and no keyboard produces it.
  let out = pattern;
  for (const [key, value] of Object.entries(slots) as [keyof Slots, string][]) {
    out = out.split(`{${key}}`).join(value.length > 0 ? value : "\uE000");
  }
  return out
    .replace(/#?\uE000/g, "\uE000")
    .replace(/\s*[·|,]\s*\uE000/g, "")
    .replace(/\uE000\s*[·|,]\s*/g, "")
    .replace(/\uE000\.?/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/^[\s·|,.]+|[\s·|,]+$/g, "")
    .trim();
}

const sentence = (s: string): string => {
  const t = s.trim();
  if (t.length === 0) return t;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

function hashtagFrom(text: string): string {
  return text
    .replace(/['’]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function buildHashtags(
  details: AthleteDetails,
  template: HypeTemplate,
): string[] {
  const candidates = [
    ...template.hashtags,
    template.subject === "team" ? "" : details.athleteName,
    details.teamOrSchool,
    details.sport,
    details.sport.length > 0 ? `${details.sport} Life` : "",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const tag = hashtagFrom(c);
    if (tag.length < 2 || tag.length > 40) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, 10);
}

function onScreen(
  details: AthleteDetails,
  template: HypeTemplate,
  slots: Slots,
): OnScreenBeat[] {
  const cards = template.cards.map((c) => fill(c, slots)).filter((c) => c.length > 0);
  const achievementCards = details.achievements.slice(0, 2).map((a) => a.toUpperCase());
  // Achievements go second-to-last, where the edit peaks.
  const all =
    cards.length > 1
      ? [...cards.slice(0, -1), ...achievementCards, cards[cards.length - 1] ?? ""]
      : [...cards, ...achievementCards];
  const step = 30 / (all.length + 1);
  return all.map((text, i) => ({ atSecond: Math.round(step * (i + 1)), text }));
}

const stamp = (second: number): string => `[0:${String(second).padStart(2, "0")}]`;

function timed(lines: readonly string[], seconds: number): string {
  const kept = lines.filter((l) => l.length > 0);
  const step = seconds / Math.max(kept.length, 1);
  return kept.map((line, i) => `${stamp(Math.round(step * i))} ${line}`).join("\n");
}

function identityLine(details: AthleteDetails, template: HypeTemplate): string {
  if (template.subject === "team") {
    return sentence(
      [details.teamOrSchool, details.sport, details.classYearOrAgeGroup]
        .filter((p) => p.length > 0)
        .join(" "),
    );
  }
  const parts = [
    details.jerseyNumber.length > 0 ? `Number ${details.jerseyNumber}` : "",
    details.position,
    details.classYearOrAgeGroup,
    details.teamOrSchool,
  ].filter((p) => p.length > 0);
  return sentence(parts.join(", "));
}

function firstSentence(text: string): string {
  const match = /^[^.!?]*[.!?]?/.exec(text.trim());
  return (match?.[0] ?? "").trim();
}

export function writeWithTemplate(request: GenerationRequest): HypePackage {
  const template = templateOrThrow(request.template);
  const { details, tone } = request;
  const slots = slotsFor(details, template);
  const [toneA, toneB] = TONE_LINES[tone];
  const achievements = details.achievements.map(sentence);
  const opener = sentence(fill(template.opener, slots));
  const closer = sentence(fill(template.closer, slots));
  const identity = identityLine(details, template);
  const personality =
    details.personalityNotes.length > 0
      ? sentence(
          `Known for: ${firstSentence(details.personalityNotes).replace(/[.!?]$/, "")}`,
        )
      : "";

  const script15 = timed([opener, achievements[0] ?? toneA, closer], 15);
  const script30 = timed(
    [
      opener,
      identity,
      toneA,
      ...achievements.slice(0, 3),
      personality,
      achievements.length === 0 ? toneB : "",
      closer,
    ],
    30,
  );

  const voiceover = [
    `(Voice: ${VOICE_BY_TONE[tone]}.)`,
    [opener, identity, toneA, ...achievements.slice(0, 3), personality, toneB, closer]
      .filter((l) => l.length > 0)
      .join(" "),
  ].join("\n");

  const hashtags = buildHashtags(details, template);
  const captionLead: Record<Tone, string> = {
    cinematic: "🎬",
    aggressive: "🔥",
    inspirational: "⭐",
    emotional: "❤️",
    fun: "🎉",
    professional: "📋",
  };
  const socialCaption = [
    `${captionLead[tone]} ${opener}`,
    achievements.slice(0, 2).join(" "),
    closer,
    "🎥 5-Star Sports Media",
  ]
    .filter((l) => l.trim().length > 0)
    .join("\n");

  const cards = onScreen(details, template, slots);
  const mediaLine =
    request.media.length === 0
      ? "No media was uploaded: use tasteful generic sports b-roll with no identifiable people."
      : `Use the uploaded ${request.media.map((m) => m.kind).join(" and ")} as the hero footage; do not alter the athlete's face, body or uniform.`;

  const videoPrompt = [
    `Create a 30-second vertical (9:16) sports hype video in a ${tone} style for 5-Star Sports Media.`,
    `Purpose: ${template.brief}`,
    `Subject: ${identity}${details.sport.length > 0 ? ` Sport: ${details.sport}.` : ""}`,
    mediaLine,
    `Visual direction: ${template.visualDirection}`,
    `On-screen text, in order: ${cards.map((c) => `"${c.text}" at ${c.atSecond}s`).join("; ")}.`,
    "Pacing: cut on the beat, build to the biggest moment around 24 seconds, clean ending with the final card held for 2 seconds.",
    "Rules: family-friendly; no text other than the listed cards; no real brand logos" +
      (details.sponsorName.length > 0 ? ` other than ${details.sponsorName}` : "") +
      "; do not add statistics, scores or awards.",
  ].join("\n");

  const musicPrompt = [
    `${MUSIC_BY_TONE[tone]}.`,
    "Length 30 seconds, peak at about 0:24, clean button ending.",
    "Original composition. Do not imitate any named artist or existing song. Instrumental so a voiceover can sit on top.",
  ].join(" ");

  const sponsorCallout =
    details.sponsorName.length > 0
      ? `This hype video is brought to you by ${details.sponsorName}.`
      : null;

  return {
    title: fill(TITLE[template.key], slots),
    script15,
    script30,
    voiceover,
    socialCaption,
    hashtags,
    onScreenText: cards,
    videoPrompt,
    musicPrompt,
    sponsorCallout,
  };
}
