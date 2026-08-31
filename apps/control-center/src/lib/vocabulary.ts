import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT, cmd } from "./shell";

/**
 * AI Persona X's vocabulary, read for review.
 *
 * ## Why the console shows this at all
 *
 * The vocabulary is every closed list in that product: what a customer can
 * choose, and — the half nobody could see — the exact phrase each choice sends
 * an image model. Both lived only in a TypeScript file, so reviewing the copy
 * meant reading source. That is an engineering chore handed to the one person
 * this console exists to keep away from engineering chores.
 *
 * ## Why it is read from a sibling checkout rather than copied here
 *
 * AI Persona X is a separate repository, deliberately isolated. Copying its
 * vocabulary into this one would create a second copy that drifts, and a review
 * surface showing copy nobody ships is worse than no review surface — HL-BOS
 * principle 10 applies to a dashboard as much as to a metric.
 *
 * So this reads the real file from the real checkout, and when it cannot find
 * one it says so, says everywhere it looked, and shows nothing. An empty panel
 * that explains itself beats a populated one that is out of date.
 *
 * The file it reads cannot itself be stale: over in that repository it is a
 * test snapshot rebuilt from the live vocabulary, so a phrase edited without
 * regenerating fails their build.
 */

const Option = z.object({
  value: z.string(),
  label: z.string(),
  phrase: z.string(),
  tier: z.number().optional(),
});

const Group = z.object({
  key: z.string(),
  label: z.string(),
  hint: z.string(),
  required: z.boolean(),
  multiple: z.boolean(),
  defaultValue: z.string(),
  askedInQuickDesign: z.boolean(),
  options: z.array(Option),
});

const Section = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  groups: z.array(Group),
});

const Rule = z.object({ title: z.string(), detail: z.string() });

const Document = z.object({
  product: z.string(),
  sections: z.array(Section),
  rules: z.array(Rule),
});

export type VocabularyOption = z.infer<typeof Option>;
export type VocabularyGroup = z.infer<typeof Group>;
export type VocabularySection = z.infer<typeof Section>;
export type VocabularyDocument = z.infer<typeof Document>;

/** Where the export lives inside the product's repository. */
const EXPORT_PATH = path.join("docs", "vocabulary.json");

/**
 * Where to look for the checkout, in order: beside this repository, then one
 * level further out.
 *
 * There is deliberately no setting for this and no environment variable. A
 * checkout in an unusual place is an engineering problem, and the operating
 * contract is that engineering never arrives here as a chore for the person
 * reading the console — if these two are ever wrong, the fix is a change to
 * this list, made by an engineer, not a knob for the CEO to find.
 *
 * Nothing beyond these is guessed. Searching the disk for a directory by name
 * is how a console ends up reading an unrelated copy and reporting it as truth.
 */
export function candidates(): readonly string[] {
  const parent = path.dirname(REPO_ROOT);
  return [
    path.join(parent, "characterstudio"),
    path.join(path.dirname(parent), "characterstudio"),
  ];
}

export interface VocabularyFound {
  readonly found: true;
  readonly doc: VocabularyDocument;
  /** The checkout it was read from, shown so the source is never a mystery. */
  readonly repoPath: string;
  /** Commit and date the file was last changed, or null if git cannot say. */
  readonly revision: { readonly hash: string; readonly date: string } | null;
  readonly totals: {
    readonly lists: number;
    readonly choices: number;
    readonly rules: number;
  };
}

export interface VocabularyMissing {
  readonly found: false;
  /** Every path tried, so the fix is obvious without reading any code. */
  readonly searched: readonly string[];
  /** Plain English. Never a raw error. */
  readonly reason: string;
}

export type VocabularyState = VocabularyFound | VocabularyMissing;

/** Last commit that touched the export, for provenance. Null when unavailable. */
async function revisionOf(
  repoPath: string,
): Promise<{ hash: string; date: string } | null> {
  const res = await cmd("git", ["log", "-1", "--format=%h|%cs", "--", EXPORT_PATH], {
    cwd: repoPath,
    timeoutMs: 15_000,
  });
  if (!res.ok) return null;
  const [hash, date] = res.stdout.trim().split("|");
  return hash && date ? { hash, date } : null;
}

/**
 * `dirs` exists so a test can prove the not-found path without deleting the
 * checkout this machine actually has. The console never passes it, and the
 * default is the only search order that ships.
 */
export async function vocabularyState(
  dirs: readonly string[] = candidates(),
): Promise<VocabularyState> {
  const searched = dirs.map((dir) => path.join(dir, EXPORT_PATH));
  let unreadable: string | null = null;

  for (const dir of dirs) {
    const file = path.join(dir, EXPORT_PATH);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }
    // The file exists. From here a failure is a real problem worth naming,
    // not a missing checkout, so it stops rather than falling through to the
    // next candidate and reporting "not found" for a file we just read. A
    // half-written or corrupt file is the likeliest way this happens, and it
    // must produce a sentence rather than a crashed page.
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      unreadable = `The file is there but it is damaged, probably written half-way through a copy. It is generated rather than typed, so it cannot be repaired by editing it — your engineer needs to regenerate it. Nothing else in the console is affected.`;
      break;
    }
    const parsed = Document.safeParse(value);
    if (!parsed.success) {
      unreadable = `The file is there, but it is in a shape this console does not recognise — most likely AI Persona X has moved on and the console has not caught up yet. Your engineer needs to update the console. Nothing is lost, and nothing else here is affected.`;
      break;
    }
    const groups = parsed.data.sections.flatMap((s) => s.groups);
    return {
      found: true,
      doc: parsed.data,
      repoPath: dir,
      revision: await revisionOf(dir),
      totals: {
        lists: groups.length,
        choices: groups.reduce((n, g) => n + g.options.length, 0),
        rules: parsed.data.rules.length,
      },
    };
  }

  return {
    found: false,
    searched,
    reason:
      unreadable ??
      // Deliberately not "clone the repository" or "set this variable". Both
      // are true and both are engineering, and the operating contract is that
      // engineering never surfaces here as a chore for the person reading it.
      "AI Persona X's code is not on this computer where the console looks for it, so there is nothing to read. Nothing is broken and there is nothing to fix by hand — this is a setup step for your engineer. The paths the console tried are below, which is what they will need.",
  };
}

/** Tier labels for the act axis. Nothing else in the vocabulary is tiered. */
export const TIER_LABEL: Readonly<Record<number, string>> = {
  0: "Nothing asked for",
  1: "Suggestive",
  2: "Explicit",
};
