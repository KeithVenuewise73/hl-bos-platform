/**
 * The 5-Star Hype Video domain.
 *
 * Every list here is a closed vocabulary rather than free text, because each
 * one is mirrored somewhere else — a database enum in migration 0051, a select
 * box in the app — and a closed list is the only kind the tests can hold the
 * two copies to.
 */

export const TEMPLATE_KEYS = [
  "game_day",
  "senior_night",
  "athlete_spotlight",
  "recruiting_intro",
  "championship_recap",
  "birthday_tribute",
  "team_intro",
  "player_of_the_game",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export const TONES = [
  "cinematic",
  "aggressive",
  "inspirational",
  "emotional",
  "fun",
  "professional",
] as const;
export type Tone = (typeof TONES)[number];

export const OUTPUT_TYPES = [
  "short_social_post",
  "hype_script",
  "voiceover_script",
  "full_video_prompt",
  "caption_package",
] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

/**
 * Mirrors `hype.project_status` in migration 0051.
 *
 * `paid_download_pending` exists for the day payments are connected. Nothing
 * in this version can put a project into it, and the status machine says so.
 */
export const PROJECT_STATUSES = [
  "draft",
  "media_uploaded",
  "details_complete",
  "generated",
  "exported",
  "paid_download_pending",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const ACCENTS = ["red", "gold", "blue"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Private is the default everywhere. See migration 0051 for what sharing requires. */
export const VISIBILITIES = ["private", "link", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const MEDIA_KINDS = ["image", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Who is making the project. Changes nothing but the wording of the consent prompt. */
export const CREATOR_ROLES = [
  "parent",
  "athlete",
  "coach",
  "team",
  "media",
  "organizer",
] as const;
export type CreatorRole = (typeof CREATOR_ROLES)[number];

export interface AthleteDetails {
  /** Athlete name, or the team name for a team template. */
  readonly athleteName: string;
  readonly sport: string;
  readonly teamOrSchool: string;
  /** Free text: "7", "00", or empty for a team video. */
  readonly jerseyNumber: string;
  readonly position: string;
  /** "Class of 2027", "12U", "Senior". */
  readonly classYearOrAgeGroup: string;
  /** One per line. The only facts any writer may state. */
  readonly achievements: readonly string[];
  readonly personalityNotes: string;
  /** Optional. Empty means no sponsor callout is written. */
  readonly sponsorName: string;
  /** Optional. For birthday tributes, a recruiting contact line, etc. */
  readonly extraContext: string;
}

export interface GenerationRequest {
  readonly template: TemplateKey;
  readonly tone: Tone;
  readonly outputTypes: readonly OutputType[];
  readonly details: AthleteDetails;
  /** Describes the uploaded media so prompts can reference it. Never the bytes. */
  readonly media: readonly { readonly kind: MediaKind; readonly label: string }[];
}

export interface OnScreenBeat {
  /** Seconds from the start of the 30-second cut. */
  readonly atSecond: number;
  readonly text: string;
}

/**
 * The generated package. Every field is plain text a person can read, copy and
 * paste — this is the deliverable until a video provider is connected.
 */
export interface HypePackage {
  readonly title: string;
  readonly script15: string;
  readonly script30: string;
  readonly voiceover: string;
  readonly socialCaption: string;
  readonly hashtags: readonly string[];
  readonly onScreenText: readonly OnScreenBeat[];
  readonly videoPrompt: string;
  readonly musicPrompt: string;
  /** Null when no sponsor was named. Never invented. */
  readonly sponsorCallout: string | null;
}

/** What produced a package, recorded with it so it is never mistaken for something else. */
export interface GenerationRecord {
  readonly package: HypePackage;
  /** "template-writer" or "claude:<model>". */
  readonly producedBy: string;
  /** True when a model was tried and its draft was refused or failed. */
  readonly fellBack: boolean;
  /** Plain-English notes: why a fallback happened, what moderation flagged. */
  readonly notes: readonly string[];
  readonly generatedAt: string;
}
