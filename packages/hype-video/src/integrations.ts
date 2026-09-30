/**
 * Future integrations: the plug-in points, and an honest account of each.
 *
 * "Assemble, don't rebuild": 5-Star Hype Video does not make video, music or
 * speech itself. It prepares everything those services need — the video
 * prompt, the music prompt, the voiceover script and voice direction — and
 * hands it over. Each service is a small adapter behind one of the interfaces
 * below.
 *
 * NONE IS CONNECTED IN THIS VERSION. The registry says so, the app renders
 * each button as disabled with the reason on it, and no code path pretends a
 * render happened. When a key is added, `status` flips to "ready" only if an
 * adapter for that capability is actually registered — a key alone does not
 * make a button live.
 */

import type { HypePackage, Tone } from "./types.ts";

// --- Adapter contracts --------------------------------------------------------

/** A job handed to an external renderer. Rendering is always asynchronous. */
export interface RenderJob {
  readonly externalId: string;
  readonly provider: string;
  readonly status: "queued" | "rendering" | "ready" | "failed";
  /** Present only when status is "ready". Never a placeholder. */
  readonly outputUrl: string | null;
  readonly error: string | null;
}

export interface VideoAdapter {
  readonly provider: string;
  submit(input: {
    readonly prompt: string;
    readonly mediaUrls: readonly string[];
    readonly aspect: "9:16" | "16:9" | "1:1";
    readonly seconds: 15 | 30;
  }): Promise<RenderJob>;
  poll(externalId: string): Promise<RenderJob>;
}

export interface MusicAdapter {
  readonly provider: string;
  submit(input: {
    readonly prompt: string;
    readonly seconds: number;
  }): Promise<RenderJob>;
  poll(externalId: string): Promise<RenderJob>;
}

export interface VoiceAdapter {
  readonly provider: string;
  synthesize(input: {
    readonly script: string;
    readonly tone: Tone;
  }): Promise<RenderJob>;
}

export interface PaymentAdapter {
  readonly provider: string;
  createCheckout(input: {
    readonly planKey: string;
    readonly projectId: string | null;
    readonly successUrl: string;
    readonly cancelUrl: string;
  }): Promise<{ readonly checkoutUrl: string }>;
}

/** Screens an image or video frame. Distinct from the text screen in moderation.ts. */
export interface MediaModerationAdapter {
  readonly provider: string;
  screen(input: {
    readonly mediaUrl: string;
    readonly kind: "image" | "video";
  }): Promise<{
    readonly allowed: boolean;
    readonly reasons: readonly string[];
  }>;
}

// --- Registry -----------------------------------------------------------------

export type CapabilityKey =
  "video" | "music" | "voice" | "payments" | "media_moderation";

export interface Capability {
  readonly key: CapabilityKey;
  /** The button label in the app. */
  readonly action: string;
  readonly what: string;
  /** Services that fit this slot. Candidates, not commitments. */
  readonly candidates: readonly string[];
  /** Which part of the package it consumes. */
  readonly consumes: string;
  /** The environment variable an adapter would read. Names only. */
  readonly keyName: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    key: "video",
    action: "Generate Video",
    what: "Turn the video prompt and your uploaded media into a rendered hype video.",
    candidates: ["Runway", "Pika", "Luma", "Kling"],
    consumes: "videoPrompt + uploaded media",
    keyName: "HYPE_VIDEO_PROVIDER_KEY",
  },
  {
    key: "music",
    action: "Generate Music",
    what: "Create an original instrumental track from the music prompt.",
    candidates: ["Suno", "Udio", "Stable Audio"],
    consumes: "musicPrompt",
    keyName: "HYPE_MUSIC_PROVIDER_KEY",
  },
  {
    key: "voice",
    action: "Create Voiceover",
    what: "Read the voiceover script aloud in the chosen voice style.",
    candidates: ["ElevenLabs", "OpenAI TTS", "Azure Speech"],
    consumes: "voiceover",
    keyName: "HYPE_VOICE_PROVIDER_KEY",
  },
  {
    key: "payments",
    action: "Upgrade",
    what: "Charge for single packages and subscriptions.",
    candidates: ["Stripe"],
    consumes: "pricing plans",
    keyName: "STRIPE_SECRET_KEY",
  },
  {
    key: "media_moderation",
    action: "Check uploads",
    what: "Screen uploaded photos and video before anything is generated or shared.",
    candidates: ["AWS Rekognition", "Hive", "Google Cloud Vision SafeSearch"],
    consumes: "uploaded media",
    keyName: "HYPE_MODERATION_PROVIDER_KEY",
  },
];

export interface CapabilityStatus extends Capability {
  readonly status: "ready" | "not_connected";
  /** Plain English, suitable for a disabled button's explanation. */
  readonly detail: string;
}

/**
 * Adapters actually registered at runtime. Empty in this version, and that is
 * the whole truth of the integrations panel.
 */
export interface RegisteredAdapters {
  readonly video?: VideoAdapter;
  readonly music?: MusicAdapter;
  readonly voice?: VoiceAdapter;
  readonly payments?: PaymentAdapter;
  readonly media_moderation?: MediaModerationAdapter;
}

export function capabilityStatuses(
  adapters: RegisteredAdapters = {},
): CapabilityStatus[] {
  return CAPABILITIES.map((cap) => {
    const adapter = adapters[cap.key];
    if (adapter !== undefined) {
      return { ...cap, status: "ready", detail: `Connected to ${adapter.provider}.` };
    }
    return {
      ...cap,
      status: "not_connected",
      detail: `Not connected yet. Needs a ${cap.candidates.join(" / ")} account and an adapter; nothing is sent anywhere until then.`,
    };
  });
}

/** What each integration would receive from a package — shown on the preview. */
export function handoff(
  pkg: HypePackage,
): Readonly<Record<"video" | "music" | "voice", string>> {
  return { video: pkg.videoPrompt, music: pkg.musicPrompt, voice: pkg.voiceover };
}
