/**
 * Shared shapes for JerseySort AI.
 *
 * These mirror the `jerseysort` schema (supabase migration 0052) and the
 * app's local store column for column, so a record means the same thing in
 * every layer.
 */

import type { JerseyShade } from "./teams.ts";

/** A rectangle in NORMALISED image coordinates: 0..1 on both axes. */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a provider believes a number it read is printed.
 *
 * The first six are places a jersey number lives. The rest are the things a
 * sports photo is full of that are NOT a jersey number, and that a naive
 * "read every digit" approach would file a photo under: the scoreboard, the
 * yard line, the sponsor banner, the clock.
 */
export const JERSEY_LOCATIONS = [
  "jersey_front",
  "jersey_back",
  "shoulder",
  "helmet",
  "shorts",
  "jersey_unspecified",
] as const;

export const NON_JERSEY_LOCATIONS = [
  "scoreboard",
  "yard_marker",
  "sign",
  "advertising",
  "clock",
  "field_marking",
  "other_not_jersey",
] as const;

export type JerseyLocation = (typeof JERSEY_LOCATIONS)[number];
export type NonJerseyLocation = (typeof NON_JERSEY_LOCATIONS)[number];

/** `unknown` = the provider cannot tell (plain OCR sees digits, not jerseys). */
export type NumberLocation = JerseyLocation | NonJerseyLocation | "unknown";

/** One number a provider read, before any interpretation. */
export interface ProviderReading {
  /** The text as read, e.g. "24", "#7", "07". */
  readonly text: string;
  /** The provider's own confidence, 0..1. */
  readonly confidence: number;
  readonly box: BoundingBox | null;
  readonly location: NumberLocation;
  /**
   * The shade of the jersey the number is printed on, which says which team
   * the athlete plays for (see teams.ts). Absent or "unknown" when the
   * provider cannot tell — local OCR sees digits, not jerseys.
   */
  readonly jersey?: JerseyShade | "unknown";
}

/** What a provider returns for one image. */
export interface ProviderResult {
  /**
   * Whether an athlete is visible. `null` means the provider cannot tell —
   * local OCR reads digits, it does not see people — and that is reported as
   * "not determined", never as "no athletes".
   */
  readonly athletesPresent: boolean | null;
  readonly athleteCount: number | null;
  readonly readings: readonly ProviderReading[];
  /** Free text from the provider, kept for the detail view. */
  readonly notes?: string;
}

export type DetectionMethod = "vision_model" | "ocr" | "manual";

/** A reading that survived interpretation: a candidate jersey number. */
export interface JerseyDetection {
  /** Canonical jersey number: "0".."99" or "00". */
  readonly value: string;
  /** 0..1, after the context rules in context.ts. */
  readonly confidence: number;
  readonly box: BoundingBox | null;
  readonly location: NumberLocation;
  readonly method: DetectionMethod;
  /** Light or dark jersey; null when not known. Team = event colors + this. */
  readonly jersey: JerseyShade | null;
}

/** A reading that was refused, and why. Kept so the refusal is inspectable. */
export interface RejectedReading {
  readonly text: string;
  readonly confidence: number;
  readonly location: NumberLocation;
  readonly reason: string;
}

/** Pipeline states a photo moves through. Mirrors jerseysort.photo_status. */
export const PHOTO_STATUSES = [
  "uploaded",
  "queued",
  "processing",
  "completed",
  "needs_review",
  "failed",
] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

/** A detection's review state. Mirrors jerseysort.detection_status. */
export type DetectionStatus = "suggested" | "confirmed" | "rejected";
