/**
 * Make a script shorter without changing what it does. Pure.
 *
 * Why: Windows allows a command line of about 32,767 characters, and a
 * PowerShell script passed with -EncodedCommand is written in UTF-16 and then
 * base64, which makes it 2.67 times longer. The iPhone script had only about
 * 330 characters to spare, and the next few lines added to it made the copy
 * fail to start at all ("The filename or extension is too long"). Comments and
 * indentation cost real room and do nothing at run time, so they are removed
 * from what is SENT; the source file keeps them for people.
 *
 * Only whole-line comments and leading spaces are touched. A here-string
 * (@' ... '@) is passed through exactly as written, because its text is data.
 */

/** PowerShell: drop blank lines, whole-line # comments and leading spaces, outside here-strings. */
export function squeezePowerShell(script: string): string {
  const out: string[] = [];
  let closer: string | null = null; // the line that ends the here-string we are inside
  for (const line of script.split("\n")) {
    if (closer !== null) {
      out.push(line);
      if (line.startsWith(closer)) closer = null;
      continue;
    }
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    out.push(t);
    // A line ending in @' or @" opens a here-string, closed by a line starting '@ or "@.
    if (/@'\s*$/.test(t)) closer = "'@";
    else if (/@"\s*$/.test(t)) closer = '"@';
  }
  return out.join("\n");
}

/** C#: drop blank lines, whole-line // comments and leading spaces. The source has no multi-line strings. */
export function squeezeCSharp(source: string): string {
  return source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"))
    .join("\n");
}
