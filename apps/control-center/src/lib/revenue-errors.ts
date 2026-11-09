import "server-only";
import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Revenue Center error reporting, on this computer.
 *
 * Every refused or failed Revenue Center action is appended to
 * apps/control-center/.data/revenue/errors.jsonl (gitignored) and the most
 * recent ones are shown on the Revenue page, so a failure is never just a
 * message that disappears on reload. Nothing is sent anywhere.
 *
 * Only the action name, the plain-English message and the time are kept — no
 * form contents, so no customer contact details end up in the log.
 */
export interface RevenueError {
  at: string;
  action: string;
  message: string;
  mode: string;
}

const MAX_BYTES = 512 * 1024;

export class RevenueErrorLog {
  constructor(
    private readonly dir: string = path.join(process.cwd(), ".data", "revenue"),
  ) {}

  private get file() {
    return path.join(this.dir, "errors.jsonl");
  }

  async record(e: Omit<RevenueError, "at">, now = new Date()): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      // Bounded: roll the log over instead of growing without limit.
      if ((await stat(this.file)).size > MAX_BYTES)
        await rename(this.file, `${this.file}.1`);
    } catch {
      /* no log yet */
    }
    const line: RevenueError = {
      at: now.toISOString(),
      action: e.action.slice(0, 80),
      mode: e.mode.slice(0, 40),
      message: e.message.replace(/\s+/g, " ").slice(0, 500),
    };
    await appendFile(this.file, `${JSON.stringify(line)}\n`, "utf8");
  }

  async recent(limit = 10): Promise<RevenueError[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return [];
    }
    const out: RevenueError[] = [];
    for (const l of raw.split("\n")) {
      if (!l.trim()) continue;
      try {
        out.push(JSON.parse(l) as RevenueError);
      } catch {
        /* a torn line is skipped, not fatal */
      }
    }
    return out.slice(-limit).reverse();
  }
}
