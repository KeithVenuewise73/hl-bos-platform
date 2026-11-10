/**
 * Reading a list of times that a person typed. Pure.
 *
 * One moment per line, a time first, then anything the person wants to call it:
 *
 *   12:34 big hit
 *   1:02:15 - goal, 14U
 *   41:02
 *   754 (seconds)
 *
 * A time is H:MM:SS, M:SS, or a plain number of seconds. A line that cannot be
 * read is reported with its line number and why, never skipped silently: a
 * missing highlight that nobody was told about is worse than an error.
 */

export interface TimedMoment {
  /** Seconds from the start of the video the person was watching. */
  readonly seconds: number;
  /** What they called it, or "". */
  readonly label: string;
  /** 1-based line in the text it came from. */
  readonly line: number;
}

export interface TimestampProblem {
  readonly line: number;
  readonly text: string;
  readonly why: string;
}

const TIME = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.\d+)?|^\d+(?:\.\d+)?/;

export function parseTimestamps(text: string): {
  readonly moments: TimedMoment[];
  readonly problems: TimestampProblem[];
} {
  const moments: TimedMoment[] = [];
  const problems: TimestampProblem[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    if (t === "" || t.startsWith("#")) return;
    const m = TIME.exec(t);
    if (m === null) {
      problems.push({
        line,
        text: t,
        why: "It does not start with a time like 12:34 or 1:02:15.",
      });
      return;
    }
    const token = m[0];
    let seconds: number;
    if (token.includes(":")) {
      const parts = token.split(":");
      const nums = parts.map(Number);
      if (nums.some((n) => !Number.isFinite(n))) {
        problems.push({ line, text: t, why: "That time could not be read." });
        return;
      }
      const secs = nums[nums.length - 1]!;
      const mins = nums[nums.length - 2]!;
      const hours = nums.length === 3 ? nums[0]! : 0;
      if (secs >= 60) {
        problems.push({
          line,
          text: t,
          why: `${token} has ${secs} seconds; seconds go up to 59.`,
        });
        return;
      }
      if (nums.length === 3 && mins >= 60) {
        problems.push({
          line,
          text: t,
          why: `${token} has ${mins} minutes; minutes go up to 59 when hours are given.`,
        });
        return;
      }
      seconds = hours * 3600 + mins * 60 + secs;
    } else {
      seconds = Number(token);
    }
    // Whatever follows the time is the name, minus joining punctuation.
    const label = t
      .slice(token.length)
      .replace(/^[\s\-–—:,;.|]+/, "")
      .trim();
    moments.push({ seconds, label, line });
  });
  return { moments, problems };
}

/** 754 -> "12:34"; 3735 -> "1:02:15". */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}
