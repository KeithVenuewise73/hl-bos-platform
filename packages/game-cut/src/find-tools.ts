/**
 * Where ffmpeg might be on this computer. Pure: the places are listed here and
 * whether a place really has the program is asked by the caller, so this is
 * tested without a disk.
 *
 * Why: a program installed for the current user is often NOT on the PATH of the
 * programs started afterwards (it was not on the one the laptop session used),
 * so looking only at the PATH says "not installed" about something that is.
 */

export interface Places {
  /** Folders on the PATH, in order. */
  readonly pathDirs: readonly string[];
  /** C:\Users\<name>\AppData\Local, or "" */
  readonly localAppData: string;
  readonly programFiles: string;
  readonly programData: string;
  /** C:\Users\<name>, or "" */
  readonly home: string;
}

const join = (...p: string[]) => p.filter((x) => x !== "").join("\\");

/** Every full path worth trying for `ffmpeg.exe`, best first. */
export function ffmpegCandidates(places: Places, exe = "ffmpeg.exe"): string[] {
  const out: string[] = [];
  for (const d of places.pathDirs) out.push(join(d.replace(/[\\/]+$/, ""), exe));
  if (places.localAppData !== "") {
    // winget puts a link here for programs it installs for one user.
    out.push(join(places.localAppData, "Microsoft", "WinGet", "Links", exe));
  }
  if (places.programData !== "")
    out.push(join(places.programData, "chocolatey", "bin", exe));
  if (places.home !== "") out.push(join(places.home, "scoop", "shims", exe));
  for (const base of [places.programFiles, "C:"]) {
    if (base === "") continue;
    out.push(join(base, "ffmpeg", "bin", exe));
  }
  return [...new Set(out)];
}

/** The ffprobe that sits next to an ffmpeg. */
export function ffprobeBeside(ffmpegPath: string): string {
  return ffmpegPath.replace(
    /ffmpeg(\.exe)?$/i,
    (_m, ext: string | undefined) => `ffprobe${ext ?? ""}`,
  );
}
