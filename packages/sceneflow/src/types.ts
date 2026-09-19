// SceneFlow AI — the shared vocabulary of the continuation engine.
//
// Everything here is DATA, not prose. The product's promise is continuity:
// the same people, the same room, the same clothes, one moment later. That is
// only enforceable if the scene is a structure the server can compare against
// the next one. A free-text prompt cannot be diffed; a SceneState can.
//
// Deliberately NOT modelled around "couples" (brief section 6). A cast is
// 2-8 adults, which makes a couple a special case of a group rather than the
// other way round.

/** Stable internal identifier for a recurring subject: `person_a` .. `person_h`. */
export type CastMemberId =
  | "person_a"
  | "person_b"
  | "person_c"
  | "person_d"
  | "person_e"
  | "person_f"
  | "person_g"
  | "person_h";

export const CAST_MEMBER_IDS: readonly CastMemberId[] = [
  "person_a",
  "person_b",
  "person_c",
  "person_d",
  "person_e",
  "person_f",
  "person_g",
  "person_h",
];

export const MIN_CAST_SIZE = 2;
export const MAX_CAST_SIZE = 8;

/** What the user sees: "Person A". Never a real-world name, never an identity claim. */
export type CastMemberLabel = string;

/**
 * Where a subject is standing, semantically. Section 14: a semantic spatial map,
 * not a 3D reconstruction. Seven foreground slots and three background slots are
 * enough to keep a cast of eight from swapping places between scenes.
 */
export type SpatialSlot =
  | "far-left"
  | "left"
  | "center-left"
  | "center"
  | "center-right"
  | "right"
  | "far-right"
  | "background-left"
  | "background-center"
  | "background-right";

export const FOREGROUND_SLOTS: readonly SpatialSlot[] = [
  "far-left",
  "left",
  "center-left",
  "center",
  "center-right",
  "right",
  "far-right",
];

export const BACKGROUND_SLOTS: readonly SpatialSlot[] = [
  "background-left",
  "background-center",
  "background-right",
];

/** User-facing intimacy ladder (section 20). Every rung stays non-explicit. */
export type IntimacyLevel = "warm" | "romantic" | "passionate" | "private-romance";

export const INTIMACY_LEVELS: readonly IntimacyLevel[] = [
  "warm",
  "romantic",
  "passionate",
  "private-romance",
];

/**
 * The CLOSED set of interactions this product will render between real people.
 *
 * Closed is the point. An open vocabulary means the boundary lives in a text
 * filter; a closed one means an unlisted act has no representation to send to a
 * provider in the first place. Adding a member here is a policy change.
 */
export type InteractionType =
  | "talk"
  | "conversation"
  | "stand-together"
  | "sit-together"
  | "pose-together"
  | "walk-together"
  | "look-out-window"
  | "laugh"
  | "observing"
  | "move-closer"
  | "eye-contact"
  | "hold-hands"
  | "touch-arm"
  | "touch-shoulder"
  | "touch-upper-back"
  | "touch-waist"
  | "touch-clothed-knee"
  | "touch-clothed-thigh"
  | "face-touch"
  | "whisper"
  | "slow-dance"
  | "embrace"
  | "cuddle"
  | "relax-together"
  | "recline-together"
  | "cheek-kiss"
  | "forehead-kiss"
  | "kiss"
  | "goodnight";

/** A structural interaction edge (section 15). Never natural language alone. */
export interface SceneInteraction {
  readonly actors: readonly CastMemberId[];
  readonly type: InteractionType;
  /** True when this edge was added by the Reciprocal Affection toggle. */
  readonly reciprocal?: boolean;
}

export type SceneInteractionGraph = readonly SceneInteraction[];

export interface CastMember {
  readonly id: CastMemberId;
  readonly label: CastMemberLabel;
  /**
   * Non-identifying appearance notes used to keep the same person looking like
   * the same person. Never a name, never an identity claim, never a guess at who
   * this is in the real world (section 10).
   */
  readonly appearance: CharacterDescriptor;
  readonly sortOrder: number;
  /** Storage paths of reference crops/images. Private objects, never public URLs. */
  readonly referencePaths: readonly string[];
}

/**
 * What CharacterLock preserves (section 11). Every field is optional because a
 * single photograph does not always show enough to state one, and inventing a
 * value here would be inventing a person.
 */
export interface CharacterDescriptor {
  readonly build?: string;
  readonly hair?: string;
  readonly complexion?: string;
  readonly apparentAgeBand?: string;
  readonly distinguishingFeatures?: readonly string[];
}

export interface Cast {
  readonly id: string;
  readonly members: readonly CastMember[];
  readonly adultConfirmed: boolean;
  readonly permissionConfirmed: boolean;
}

export interface CameraState {
  readonly shot: CameraShot;
  readonly orientation: "portrait" | "square" | "landscape";
  readonly height: "low" | "eye-level" | "high";
}

export type CameraShot =
  | "same"
  | "closer"
  | "wider"
  | "side-angle"
  | "over-shoulder"
  | "portrait"
  | "full-body"
  | "group-portrait";

export interface EnvironmentState {
  readonly type: string;
  readonly lighting: string;
  readonly timeOfDay: string;
  readonly features: readonly string[];
}

export interface CharacterPlacement {
  readonly id: CastMemberId;
  readonly position: SpatialSlot;
  readonly pose: string;
}

/** The structured reading of one photograph (section 12). */
export interface SceneState {
  readonly characters: readonly CharacterPlacement[];
  readonly wardrobe: WardrobeMap;
  readonly environment: EnvironmentState;
  readonly camera: CameraState;
  readonly interactions: SceneInteractionGraph;
  readonly mood: string;
  readonly photoStyle: string;
}

/** Per-character clothing. A partial map: absent means "unchanged / unknown". */
export type WardrobeMap = Partial<Record<CastMemberId, string>>;

export type SpatialMap = Partial<Record<CastMemberId, SpatialSlot>>;

/** What SceneLock holds steady between scenes (section 13). */
export interface SceneLock {
  readonly characters: boolean;
  readonly room: boolean;
  readonly wardrobe: boolean;
  readonly lighting: boolean;
  readonly timeOfDay: boolean;
  readonly visualStyle: boolean;
  readonly camera: boolean;
  readonly positions: boolean;
}

/** Everything the user asked to CHANGE for the next scene. */
export interface SceneChangeRequest {
  readonly interactions?: SceneInteractionGraph;
  readonly focusCharacterIds?: readonly CastMemberId[];
  readonly camera?: Partial<CameraState>;
  readonly wardrobe?: WardrobeMap;
  readonly environment?: Partial<EnvironmentState>;
  readonly positions?: SpatialMap;
  readonly mood?: string;
  readonly intimacy?: IntimacyLevel;
  readonly reciprocalAffection?: boolean;
  readonly sceneDescription?: string;
}

export type AspectRatio = "4:5" | "1:1" | "16:9";
export const DEFAULT_ASPECT_RATIO: AspectRatio = "4:5";

export type GenerationType =
  "single" | "story-3" | "story-6" | "variation" | "regenerate" | "continue" | "branch";

export interface StoryBeat {
  readonly number: number;
  readonly title: string;
  readonly interaction: string;
  readonly intimacy: IntimacyLevel;
}

export interface StoryPlan {
  readonly title: string;
  readonly presetSlug: string | null;
  readonly cast: readonly CastMemberId[];
  readonly scenes: readonly StoryBeat[];
}

/** The assembled context a scene is generated from (section 30). */
export interface ContinuityContext {
  readonly storyId: string;
  readonly cast: readonly CastMemberId[];
  readonly characterReferences: Readonly<Record<string, readonly string[]>>;
  readonly characterDescriptors: Readonly<
    Partial<Record<CastMemberId, CharacterDescriptor>>
  >;
  readonly currentSpatialMap: SpatialMap;
  readonly currentInteractionGraph: SceneInteractionGraph;
  readonly environment: EnvironmentState;
  readonly wardrobeMap: WardrobeMap;
  readonly lighting: string;
  readonly photoStyle: string;
  readonly timeOfDay: string;
  readonly mood: string;
  readonly camera: CameraState;
  readonly parentSceneId: string | null;
  readonly previousSceneDescription: string;
  readonly narrativePosition: number;
  readonly focusCharacterIds: readonly CastMemberId[];
}
