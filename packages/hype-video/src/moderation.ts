/**
 * Content screen — a PLACEHOLDER, and named as one.
 *
 * This is a keyword and pattern screen, not a moderation service. It catches
 * the obvious: profanity, threats and slurs in a family product, and — the one
 * that matters most for youth athletes — contact and location details that
 * must never end up in a public caption about a child.
 *
 * It does NOT look at images or video. Nothing in this repository inspects
 * uploaded media; that needs a real moderation provider (see
 * `integrations.ts`, capability "moderation"). The app says so on screen
 * rather than implying the upload was checked.
 *
 * The screen runs on the user's input before any writer sees it, and again on
 * every writer's output before it can be saved, so a model cannot introduce
 * what the input screen would have refused.
 */

export type ModerationCategory = "profanity" | "threat" | "personal_info";

export interface ModerationFlag {
  readonly category: ModerationCategory;
  /** Plain English, safe to show: never echoes the offending word back. */
  readonly reason: string;
}

export interface ModerationResult {
  readonly allowed: boolean;
  readonly flags: readonly ModerationFlag[];
  /** Always states what kind of check this was. */
  readonly screenedBy: "keyword-screen-placeholder";
}

// Deliberately short and deliberately whole-word. A long list catches
// "Scunthorpe"; a short one catches what a parent would actually be upset by.
const PROFANITY = [
  "fuck",
  "fucking",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cunt",
  "damn",
  "piss",
];

// Violence phrased at people, not sports violence. "Destroy the defense" is a
// hype video; "kill him" is not.
const THREAT_PATTERNS: readonly RegExp[] = [
  /\bkill (him|her|them|you|that kid)\b/i,
  /\b(shoot|stab) (him|her|them|you|up)\b/i,
  /\bhurt (him|her|them) (bad|for real)\b/i,
  /\bbring a (gun|knife|weapon)\b/i,
];

const PERSONAL_INFO: readonly { readonly pattern: RegExp; readonly reason: string }[] =
  [
    {
      pattern: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/,
      reason: "Looks like a phone number. Contact details must not go in a hype video.",
    },
    {
      pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
      reason:
        "Looks like an email address. Contact details must not go in a hype video.",
    },
    // Two shapes, because the obvious single pattern ("number, words, 'way'")
    // flags "scored 20 points on the way to a win". Capitalised street names
    // ("123 Oak Ridge Dr") or a short lowercase run ending in a full street word
    // ("123 oak street").
    {
      pattern:
        /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Way)\b/,
      reason:
        "Looks like a street address. Where an athlete lives must not go in a hype video.",
    },
    {
      pattern: /\b\d{1,6}\s+(?:[a-z]+\s){1,2}(?:street|avenue|boulevard)\b/i,
      reason:
        "Looks like a street address. Where an athlete lives must not go in a hype video.",
    },
  ];

export function screenText(text: string): ModerationResult {
  const flags: ModerationFlag[] = [];
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);

  if (PROFANITY.some((w) => words.has(w))) {
    flags.push({
      category: "profanity",
      reason: "Contains language that is not family-friendly.",
    });
  }
  if (THREAT_PATTERNS.some((p) => p.test(text))) {
    flags.push({
      category: "threat",
      reason: "Contains wording that reads as a threat toward a person.",
    });
  }
  for (const { pattern, reason } of PERSONAL_INFO) {
    if (pattern.test(text) && !flags.some((f) => f.reason === reason)) {
      flags.push({ category: "personal_info", reason });
    }
  }

  return {
    allowed: flags.length === 0,
    flags,
    screenedBy: "keyword-screen-placeholder",
  };
}

/** Screen several labelled fields; each flag's reason names the field. */
export function screenFields(
  fields: Readonly<Record<string, string>>,
): ModerationResult {
  const flags: ModerationFlag[] = [];
  for (const [label, value] of Object.entries(fields)) {
    for (const flag of screenText(value).flags) {
      flags.push({ category: flag.category, reason: `${label}: ${flag.reason}` });
    }
  }
  return {
    allowed: flags.length === 0,
    flags,
    screenedBy: "keyword-screen-placeholder",
  };
}
