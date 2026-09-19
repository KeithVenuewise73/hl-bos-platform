// Provider abstractions (sections 33 and 44).
//
// Two interfaces, no vendor. The engine never imports a model SDK, so changing
// image provider is a new adapter file rather than a rewrite — the same rule
// the platform already applies to its text AI, billing, comms and social
// providers.
//
// Credentials are resolved by Vault REFERENCE at the edge, exactly as
// ai.providers.credential_ref already works here. No secret reaches this
// package, and none reaches a mobile client.

import type { AspectRatio } from "./types.js";

export interface ImageGenerationRequest {
  /** Private storage path of the source photograph. */
  readonly sourceImage: string;
  /** Private storage paths of per-character reference images (section 34). */
  readonly referenceImages: readonly string[];
  /** Composed server-side. Never supplied by a client. */
  readonly prompt: string;
  readonly aspectRatio: AspectRatio;
  readonly quality: "standard" | "high";
  readonly seed?: number;
  /** The parent scene's image, where the provider supports chaining. */
  readonly previousImage?: string;
  readonly metadata: Readonly<Record<string, string>>;
  /** Same key, same result: a retry must not double-charge or double-generate. */
  readonly idempotencyKey: string;
}

export type GenerationStatus =
  "queued" | "generating" | "complete" | "failed" | "blocked";

export interface GenerationResult {
  readonly status: GenerationStatus;
  readonly providerJobId: string;
  /** Storage path of the produced image. Present only when status is complete. */
  readonly imagePath?: string;
  /** How many people the provider reports in the output, where it can say. */
  readonly observedCharacterCount?: number;
  readonly errorCode?: string;
  /** Safe for a user to read. Never a stack trace, a key or a provider internal. */
  readonly errorMessage?: string;
}

export interface ImageGenerationProvider {
  readonly kind: string;
  generate(request: ImageGenerationRequest): Promise<GenerationResult>;
  getStatus(providerJobId: string): Promise<GenerationResult>;
}

export interface ModerationVerdict {
  readonly allowed: boolean;
  readonly categories: readonly string[];
  readonly reason: string | null;
}

export interface ModerationProvider {
  readonly kind: string;
  moderateText(text: string): Promise<ModerationVerdict>;
  /** `image` is a private storage path, never bytes and never a public URL. */
  moderateImage(image: string): Promise<ModerationVerdict>;
}

/** Analytics (section 58). Abstracted so no image or prompt can reach a vendor. */
export type AnalyticsEvent =
  | "signup_completed"
  | "image_uploaded"
  | "scene_analyzed"
  | "cast_created"
  | "story_started"
  | "generation_started"
  | "generation_completed"
  | "generation_failed"
  | "generation_blocked"
  | "continue_from_here"
  | "variation_created"
  | "story_completed"
  | "favorite_added"
  | "paywall_viewed"
  | "purchase_started"
  | "purchase_completed";

/**
 * Analytics properties are restricted to this shape BY TYPE, so "just add the
 * prompt to the event" cannot be done by accident. Section 58 forbids sending
 * original images, private reference URLs or prompts; a `Record<string,
 * unknown>` would make that a rule someone has to remember.
 */
export interface AnalyticsProperties {
  readonly generationType?: string;
  readonly sceneCount?: number;
  readonly castSize?: number;
  readonly presetSlug?: string;
  readonly intimacyLevel?: string;
  readonly entitlement?: string;
  readonly reasonCode?: string;
  readonly durationMs?: number;
}

export interface AnalyticsSink {
  track(event: AnalyticsEvent, properties: AnalyticsProperties): void;
}
