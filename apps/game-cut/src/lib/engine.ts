import "server-only";

import { existsSync } from "node:fs";

import {
  Cancelled,
  capabilities,
  ffmpegCandidates,
  ffprobeBeside,
  type Tools,
} from "@hl-bos/game-cut";

import type { ToolStatus } from "./types.ts";

/**
 * Finding ffmpeg. A program installed for one user is often not on the PATH of
 * programs started afterwards, so the usual installer places are tried too.
 * The result is remembered until the page asks to look again.
 */

function places() {
  // eslint-disable-next-line no-restricted-properties -- the standard Windows folders, read to find a program; not configuration
  const env = process.env;
  const sep = process.platform === "win32" ? ";" : ":";
  return {
    pathDirs: (env["PATH"] ?? env["Path"] ?? "").split(sep).filter((d) => d !== ""),
    localAppData: env["LOCALAPPDATA"] ?? "",
    programFiles: env["ProgramFiles"] ?? "",
    programData: env["ProgramData"] ?? "",
    home: env["USERPROFILE"] ?? "",
  };
}

let found: Tools | null | undefined;

export function findTools(forceLookAgain = false): Tools | null {
  if (found !== undefined && !forceLookAgain) return found;
  const windows = process.platform === "win32";
  const candidates = windows
    ? ffmpegCandidates(places())
    : places().pathDirs.map((d) => `${d}/ffmpeg`);
  for (const c of candidates) {
    if (existsSync(c)) {
      const probe = windows ? ffprobeBeside(c) : c.replace(/ffmpeg$/, "ffprobe");
      if (existsSync(probe)) {
        found = { ffmpeg: c, ffprobe: probe };
        return found;
      }
    }
  }
  found = null;
  return null;
}

export async function toolStatus(forceLookAgain = false): Promise<ToolStatus> {
  const tools = findTools(forceLookAgain);
  if (tools === null) {
    return {
      found: false,
      path: null,
      hdrConversion: null,
      message:
        "ffmpeg is not installed on this computer, and Game Cut needs it to read and cut video. It is free. It could not be found on the PATH or in the usual install places.",
    };
  }
  try {
    const caps = await capabilities(tools);
    return {
      found: true,
      path: tools.ffmpeg,
      hdrConversion: caps.hdrConversion,
      message: caps.hdrConversion
        ? `ffmpeg found (${tools.ffmpeg}).`
        : `ffmpeg found (${tools.ffmpeg}), but it cannot convert HDR colours, so iPhone HDR video will look washed out. A fuller build fixes that.`,
    };
  } catch (e) {
    return {
      found: false,
      path: tools.ffmpeg,
      hdrConversion: null,
      message: `ffmpeg was found at ${tools.ffmpeg} but would not run: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** A stop on purpose is not a failure. */
export const isStop = (e: unknown): boolean => e instanceof Cancelled;
