/**
 * The eight seed templates.
 *
 * A template is a creative brief, not a fill-in-the-blanks string: it says what
 * the video is FOR, how it is paced, what the camera should do and what the
 * closing moment is. The writers (built-in and AI) both read these, so a
 * template edited here changes every provider at once.
 *
 * These rows are also seeded into `hype.hype_templates` by migration 0051. The
 * app's test suite checks the two lists match, key for key.
 */

import type { TemplateKey, Tone } from "./types.ts";

export interface HypeTemplate {
  readonly key: TemplateKey;
  readonly name: string;
  /** One line, for the template picker. */
  readonly tagline: string;
  readonly defaultTone: Tone;
  /** A team template names the team, not a single athlete. */
  readonly subject: "athlete" | "team";
  /** The purpose, stated to the writer. */
  readonly brief: string;
  /** Opening line pattern. `{name}` `{team}` `{sport}` are filled from details. */
  readonly opener: string;
  /** Closing line pattern. */
  readonly closer: string;
  /** Camera and edit direction for the video-generation prompt. */
  readonly visualDirection: string;
  /** Hashtags that belong to the template, before athlete-specific ones. */
  readonly hashtags: readonly string[];
  /** Short on-screen cards, in order. `{...}` placeholders as above. */
  readonly cards: readonly string[];
}

export const TEMPLATES: readonly HypeTemplate[] = [
  {
    key: "game_day",
    name: "Game Day Hype Video",
    tagline: "Pre-game energy for the feed before kickoff, tip-off or first pitch.",
    defaultTone: "aggressive",
    subject: "athlete",
    brief:
      "A pre-game hype piece posted the morning of, or the night before, a game. Builds anticipation. Present tense, forward-looking.",
    opener: "Game day. {name} is locked in.",
    closer: "Lights on. Let's work.",
    visualDirection:
      "Slow push-in on the athlete in uniform, quick cuts of warm-up, lacing up, stadium or gym lights snapping on, crowd blur, final freeze-frame on the athlete.",
    hashtags: ["GameDay", "LockedIn", "5StarSportsMedia"],
    cards: ["GAME DAY", "{name}", "#{jersey} · {position}", "{team}", "LET'S WORK"],
  },
  {
    key: "senior_night",
    name: "Senior Night Tribute",
    tagline: "Honor a senior's journey on their last home night.",
    defaultTone: "emotional",
    subject: "athlete",
    brief:
      "A tribute for senior night. Reflective and grateful, celebrating the years the athlete has given the program, and thanking family and coaches. Warm, not sad.",
    opener: "Every season led to this night.",
    closer: "Thank you, {name}. Forever part of {team}.",
    visualDirection:
      "Warm golden-hour grade, slow motion, the athlete walking onto the field with family, lingering close-ups, earlier-years photos fading into present day.",
    hashtags: ["SeniorNight", "ThankYouSeniors", "5StarSportsMedia"],
    cards: ["SENIOR NIGHT", "{name}", "{class}", "{team}", "THANK YOU"],
  },
  {
    key: "athlete_spotlight",
    name: "Athlete Spotlight",
    tagline: "A profile piece: who they are on and off the field.",
    defaultTone: "cinematic",
    subject: "athlete",
    brief:
      "A spotlight profile. Introduces the athlete as a person and a competitor. Balanced: work ethic, personality and what they have achieved.",
    opener: "Meet {name}.",
    closer: "{name}. {team}. Remember the name.",
    visualDirection:
      "Cinematic portrait lighting, shallow depth of field, mix of action and candid moments, name title card over a hero shot.",
    hashtags: ["AthleteSpotlight", "RememberTheName", "5StarSportsMedia"],
    cards: ["SPOTLIGHT", "{name}", "{sport} · {position}", "{team}"],
  },
  {
    key: "recruiting_intro",
    name: "Recruiting Intro",
    tagline: "A clean, coach-ready introduction with the facts up front.",
    defaultTone: "professional",
    subject: "athlete",
    brief:
      "A recruiting introduction aimed at college coaches. Factual, concise, respectful. States position, class, school and verified achievements. No exaggeration: coaches check.",
    opener: "{name}. {position}. {class}.",
    closer: "Thank you for watching. {name}, {team}.",
    visualDirection:
      "Clean, well-lit, minimal graphics. Name, position and class on a lower-third. Action footage with steady pacing, no flashy transitions.",
    hashtags: ["Recruiting", "StudentAthlete", "5StarSportsMedia"],
    cards: ["{name}", "{position} · {class}", "{team}", "{sport}"],
  },
  {
    key: "championship_recap",
    name: "Championship Recap",
    tagline: "Relive the title run while it is still loud.",
    defaultTone: "cinematic",
    subject: "athlete",
    brief:
      "A recap of a championship game or title run. Celebratory and triumphant. Past tense for what happened, present tense for the feeling.",
    opener: "They said it would take everything. It did.",
    closer: "Champions. {team}.",
    visualDirection:
      "Big crowd sound, trophy lift in slow motion, confetti, team dogpile, the athlete's key moments cut on the beat, closing wide shot of the celebration.",
    hashtags: ["Champions", "TitleRun", "5StarSportsMedia"],
    cards: ["CHAMPIONSHIP", "{team}", "{name}", "CHAMPIONS"],
  },
  {
    key: "birthday_tribute",
    name: "Birthday Sports Tribute",
    tagline: "A birthday shout-out with a sports-media twist.",
    defaultTone: "fun",
    subject: "athlete",
    brief:
      "A birthday tribute for a young athlete, usually from a parent. Joyful, affectionate and family-friendly. Celebrates the person first, the athlete second.",
    opener: "Breaking news from the {team} locker room…",
    closer: "Happy birthday, {name}!",
    visualDirection:
      "Bright, playful grade, sports-broadcast style lower-thirds, confetti burst, the athlete's photo framed like a trading card.",
    hashtags: ["HappyBirthday", "BirthdayMVP", "5StarSportsMedia"],
    cards: ["BREAKING NEWS", "{name}", "BIRTHDAY MVP", "HAPPY BIRTHDAY!"],
  },
  {
    key: "team_intro",
    name: "Team Intro Video",
    tagline: "Introduce the whole squad for the new season.",
    defaultTone: "aggressive",
    subject: "team",
    brief:
      "A season-opening team introduction. About the group, not one player. Unity, identity and the season ahead.",
    opener: "New season. Same standard.",
    closer: "This is {team}.",
    visualDirection:
      "Team walking out in formation, lineup shots, quick individual looks to camera, team huddle from above, logo reveal to close.",
    hashtags: ["TeamIntro", "NewSeason", "5StarSportsMedia"],
    cards: ["{team}", "{sport}", "{class}", "THIS IS US"],
  },
  {
    key: "player_of_the_game",
    name: "Player of the Game Post",
    tagline: "Quick-turn recognition for last night's standout.",
    defaultTone: "fun",
    subject: "athlete",
    brief:
      "A quick post recognizing the player of the game. Short, punchy, specific about what they did — using only what was entered.",
    opener: "Player of the Game: {name}.",
    closer: "Big-time performance. {team}.",
    visualDirection:
      "Bold graphic card with the athlete's photo, a quick zoom, stat-style overlay using only the entered achievements, then the team logo.",
    hashtags: ["PlayerOfTheGame", "POTG", "5StarSportsMedia"],
    cards: ["PLAYER OF THE GAME", "{name}", "#{jersey}", "{team}"],
  },
];

export function findTemplate(key: string): HypeTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

export function templateOrThrow(key: string): HypeTemplate {
  const found = findTemplate(key);
  if (found === undefined) throw new Error(`Unknown template: ${key}`);
  return found;
}

/**
 * Music direction by tone. The writer never names a real song or artist: a
 * generated track in the style of a named artist is the easiest way for a
 * family video to become a takedown notice.
 */
export const MUSIC_BY_TONE: Readonly<Record<Tone, string>> = {
  cinematic:
    "Epic orchestral trailer build with taiko drums and rising strings, 90 BPM swelling to a big hit, no vocals",
  aggressive:
    "Hard-hitting trap beat with heavy 808s, distorted bass and stadium claps, 140 BPM, no explicit lyrics",
  inspirational:
    "Uplifting anthemic pop-rock with driving piano and building drums, 120 BPM, wordless choir on the peak",
  emotional:
    "Gentle piano and warm strings, slow build to a soaring final chorus, 70 BPM, no vocals",
  fun: "Bright upbeat pop with handclaps, whistles and a bouncy bassline, 118 BPM, family-friendly",
  professional:
    "Clean modern corporate-sports underscore, steady percussion and light synths, 100 BPM, unobtrusive under voice",
};

/** Voice direction by tone, for a future text-to-speech provider. */
export const VOICE_BY_TONE: Readonly<Record<Tone, string>> = {
  cinematic: "deep, measured trailer narrator",
  aggressive: "intense, punchy arena announcer",
  inspirational: "warm, rising, motivational coach",
  emotional: "soft, sincere, unhurried storyteller",
  fun: "bright, playful sports-broadcast host",
  professional: "clear, neutral, confident broadcaster",
};
