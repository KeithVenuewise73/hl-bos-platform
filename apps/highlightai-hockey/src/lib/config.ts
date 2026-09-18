import "server-only";

/**
 * The app's environment boundary.
 *
 * The only file that reads process.env, so there is exactly one place to look
 * when asking what this deployment actually has switched on. Nothing here is
 * browser-visible.
 */

export interface AppConfig {
  /** Where the local JSON store lives. */
  readonly dataDir: string;
  /**
   * The media root, SHARED with the vision service.
   *
   * Both processes read and write files here, and both address them by a
   * relative storage key. They must be pointed at the same directory or every
   * analysis fails at the first step — which is exactly how the first real
   * upload through the UI failed.
   */
  readonly mediaRoot: string;
  /** The vision service, if one is configured. Undefined means none. */
  readonly visionServiceUrl: string | undefined;
  /** Which HL-BOS environment this process belongs to. Decides the auth mode. */
  readonly hlBosEnv: string | undefined;
  readonly nodeEnv: string | undefined;
  /** Supabase, when configured. Publishable key only — never service-role. */
  readonly supabaseUrl: string | undefined;
  readonly supabasePublishableKey: string | undefined;
  /** Largest upload accepted, in bytes. */
  readonly maxUploadBytes: number;
}

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached !== undefined) return cached;
  const env = process.env;
  const nonEmpty = (value: string | undefined): string | undefined =>
    value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
  cached = {
    dataDir: env["HOCKEY_DATA_DIR"] ?? ".data",
    mediaRoot:
      nonEmpty(env["HOCKEY_MEDIA_ROOT"]) ??
      `${env["HOCKEY_DATA_DIR"] ?? ".data"}/media`,
    visionServiceUrl: nonEmpty(env["HOCKEY_VISION_URL"]),
    hlBosEnv: nonEmpty(env["HL_BOS_ENV"]),
    nodeEnv: nonEmpty(env["NODE_ENV"]),
    supabaseUrl: nonEmpty(env["NEXT_PUBLIC_SUPABASE_URL"]),
    supabasePublishableKey: nonEmpty(env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]),
    // 8GB. A 90-minute game at 1080p from a phone is comfortably several GB,
    // and rejecting a real game video is a worse failure than accepting a big
    // one.
    maxUploadBytes: Number(env["HOCKEY_MAX_UPLOAD_BYTES"] ?? 8 * 1024 * 1024 * 1024),
  };
  return cached;
}

/** Testing hook. */
export function resetConfigCache(): void {
  cached = undefined;
}
