// The real-person safety boundary (brief section 2), as enforced code.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS, AND WHAT IT IS NOT
// ---------------------------------------------------------------------------
//
// This is a DETERMINISTIC PRE-GATE. It runs before anything reaches a model, it
// is the same every time, and it is testable without a network. It is NOT a
// moderation system and must never be presented as one. Brief section 44 is
// explicit: "Do not depend only on keyword filters." The pipeline therefore
// requires BOTH this gate and a ModerationProvider to pass, and fails closed
// when no provider is configured (see pipeline.ts).
//
// The structural boundary is carried by the closed interaction vocabulary in
// vocabulary.ts: an act with no vocabulary member has nothing to compose into a
// prompt, whatever text accompanies it. This file exists for the one place a
// user's own words enter the system — custom directions, custom wardrobe,
// custom settings (section 32).
//
// ---------------------------------------------------------------------------
// TWO OUTCOMES, NOT ONE
// ---------------------------------------------------------------------------
//
// Section 2 asks for a blocked request to be answered with the nearest
// permitted romantic alternative. That is right for a request that is merely
// too explicit. It is WRONG for a request involving a minor, a request framed
// as non-consensual, or one that names a public figure: offering a "nearest
// romantic alternative" to those is not a safety feature. Those are refused,
// full stop, with no alternative to click.
//
// ---------------------------------------------------------------------------
// FALSE POSITIVES ARE A SAFETY BUG TOO
// ---------------------------------------------------------------------------
//
// A gate that fires on "analysis", "assemble" or "make minor adjustments to the
// lighting" teaches people to route around it, and the routes they find work on
// the real cases as well. Every ambiguous term below is either absent with a
// note saying why, or narrowed to a phrase that cannot appear innocently.

export type PolicyReasonCode =
  | "explicit_sexual_act"
  | "explicit_nudity"
  | "undressing_to_expose"
  | "minor_or_ambiguous_age"
  | "non_consent"
  | "public_figure";

/** Reason codes that are refused outright — never answered with an alternative. */
export const HARD_REFUSAL_CODES: readonly PolicyReasonCode[] = [
  "minor_or_ambiguous_age",
  "non_consent",
  "public_figure",
];

export interface PolicyVerdict {
  readonly allowed: boolean;
  /** Worst first. A hard-refusal code always outranks a "too explicit" one. */
  readonly reasonCodes: readonly PolicyReasonCode[];
  /**
   * The nearest permitted romantic alternative, in the user's language, or null
   * when the request is refused rather than redirected.
   */
  readonly alternative: string | null;
  readonly hardRefusal: boolean;
  /** Plain-English and non-technical. Safe to show a user; leaks no internals. */
  readonly message: string;
}

const ALLOWED: PolicyVerdict = {
  allowed: true,
  reasonCodes: [],
  alternative: null,
  hardRefusal: false,
  message: "",
};

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

export interface TextVariants {
  /** Lowercased, de-accented, punctuation to spaces. Digits survive as digits. */
  readonly plain: string;
  /** As `plain`, with leetspeak resolved and repeated letters clamped to two. */
  readonly folded: string;
  /** `folded` with every space removed, for "s e x u a l" and "s.e.x.u.a.l". */
  readonly flat: string;
}

/**
 * Both readings are kept, because folding is lossy in a way that matters:
 * resolving leetspeak turns "18" into "i8", which would make `under 18`
 * unmatchable. Rules run against both, and a hit in either counts.
 */
export function normalizeText(input: string): TextVariants {
  const deAccented = input.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const plain = deAccented
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const folded = plain
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1$1");
  return { plain, folded, flat: folded.replace(/ /g, "") };
}

// ---------------------------------------------------------------------------
// Term tables
// ---------------------------------------------------------------------------

interface Rule {
  readonly code: PolicyReasonCode;
  readonly patterns: readonly RegExp[];
}

const RULES: readonly Rule[] = [
  {
    code: "explicit_sexual_act",
    patterns: [
      /\b(?:sexual|sexually|intercourse|penetration|penetrate|penetrating)\b/,
      /\b(?:have|has|having|had) sex\b|\bsex (?:scene|act|acts)\b/,
      /\b(?:oral sex|blow ?job|fellatio|cunnilingus|hand ?job|rim ?job)\b/,
      /\b(?:masturbate|masturbates|masturbating|masturbation|fingering)\b/,
      /\b(?:porn|porno|pornographic|pornography|xxx|hentai)\b/,
      /\b(?:erotic|erotica|smut|obscene|lewd)\b/,
      /\b(?:doggy style|reverse cowgirl|humping|thrusting)\b/,
      /\b(?:orgasm|orgasms|orgasming|ejaculat\w+|aroused|arousal|horny)\b/,
      // Euphemisms. "sleeping next to" and "sleep together" are NOT matched —
      // a goodnight scene is a supported, non-explicit beat of the product.
      /\b(?:make|makes|making) love\b/,
      /\bsleep(?:s|ing)? with\b/,
    ],
  },
  {
    code: "explicit_nudity",
    patterns: [
      /\b(?:nude|nudes|nudity|naked|unclothed|undressed|topless|bottomless)\b/,
      /\b(?:genital|genitals|genitalia|penis|vagina|vulva|scrotum|testicles?)\b/,
      /\b(?:nipple|nipples|areola|areolae)\b/,
      /\bbare (?:breast|breasts|chest|bottom|behind|body)\b/,
      /\bexposed (?:breast|breasts|chest|body|skin|anatomy|flesh)\b/,
      /\b(?:no clothes|without clothes|wearing nothing|nothing on)\b/,
      /\bsee through\b|\btransparent (?:top|dress|clothing|fabric)\b/,
    ],
  },
  {
    code: "undressing_to_expose",
    patterns: [
      /\b(?:undress|undresses|undressing|disrobe|disrobes|disrobing)\b/,
      // "strip" alone is absent: a comic strip, a strip of light, the Sunset
      // Strip. Only the undressing senses are matched.
      /\bstrip(?:s|ped|ping)? (?:off|down|naked|nude|bare)\b/,
      /\b(?:take|takes|taking) off (?:his|her|their|the|my) (?:clothes|clothing|dress|shirt|top|bra|underwear|pants|trousers|skirt)\b/,
      /\b(?:remove|removes|removing) (?:his|her|their|the|my) (?:clothes|clothing|dress|shirt|top|bra|underwear|pants|trousers|skirt)\b/,
      /\b(?:pull|pulls|pulling) (?:down|off|open) (?:his|her|their|the)\b/,
      /\b(?:unbutton|unbuttons|unbuttoning|unzip|unzips|unzipping)\b/,
    ],
  },
  {
    code: "minor_or_ambiguous_age",
    patterns: [
      // Bare "minor" is absent on purpose: "make minor adjustments to the
      // lighting" is an ordinary request and must not be refused.
      /\b(?:child|children|kid|kids|minors|underage|under aged)\b/,
      /\ba minor\b|\bthe minor\b/,
      /\b(?:teen|teens|teenage|teenager|teenagers|preteen|pre teen|adolescent)\b/,
      /\b(?:schoolgirl|schoolboy|school girl|school boy|high school|middle school)\b/,
      /\b(?:toddler|infant|newborn|juvenile|loli|shota|jailbait)\b/,
      /\b(?:young|little|small) (?:girl|boy|girls|boys)\b/,
      /\bunder (?:18|eighteen)\b/,
      /\b(?:not|barely) (?:an adult|adults|of age|legal)\b/,
    ],
  },
  {
    code: "non_consent",
    patterns: [
      /\b(?:non consensual|nonconsensual|without consent|no consent)\b/,
      /\b(?:rape|rapes|raping|molest|molests|molesting)\b/,
      /\b(?:coerce|coerces|coercing|coerced|blackmail\w*)\b/,
      // Narrowed to an object pronoun: "forced perspective" is a camera term
      // and "a forced smile" is an expression, neither of which is this.
      /\b(?:force|forces|forced|forcing) (?:him|her|them)\b/,
      /\bagainst (?:his|her|their) will\b/,
      /\b(?:unwilling|resisting|struggling against)\b/,
      /\b(?:doesn t|does not|don t|do not) (?:want|consent|agree)\b/,
      /\b(?:drugged|unconscious|passed out|incapacitated)\b/,
      /\bsexual assault\b/,
    ],
  },
  {
    code: "public_figure",
    patterns: [
      /\b(?:celebrity|celebrities|public figure|public figures)\b/,
      /\b(?:movie star|pop star|film star|rock star|famous actor|famous actress)\b/,
      /\b(?:politician|politicians|president|prime minister|senator|royal family)\b/,
    ],
  },
];

/**
 * Terms distinctive enough to also match with every separator stripped, which is
 * how "s e x u a l" and "s.e.x.u.a.l" get caught. The entry requirement is that
 * the term cannot appear inside ordinary running text once spaces are removed —
 * "sex" fails it (unisex), "anal" fails it (analysis), "ass" fails it (assemble,
 * classic, passion), and "topless" fails it ("the top less formal one").
 */
const DESPACED: readonly (readonly [PolicyReasonCode, string])[] = [
  ["explicit_sexual_act", "sexual"],
  ["explicit_sexual_act", "intercourse"],
  ["explicit_sexual_act", "masturbat"],
  ["explicit_sexual_act", "blowjob"],
  ["explicit_sexual_act", "pornographic"],
  ["explicit_sexual_act", "pornography"],
  ["explicit_nudity", "genitalia"],
  ["explicit_nudity", "nipples"],
  ["non_consent", "nonconsensual"],
  ["minor_or_ambiguous_age", "underage"],
  ["minor_or_ambiguous_age", "jailbait"],
];

/** A stated age under 18, read from the plain variant where digits survive. */
const UNDER_18 = /\b(?:[1-9]|1[0-7]) (?:year|yr|yrs|years|yo)(?: old)?\b/;

const ALTERNATIVES: Readonly<Record<PolicyReasonCode, string | null>> = {
  explicit_sexual_act:
    "a close kiss, a held embrace, cuddling together, or a romantic goodnight moment",
  explicit_nudity:
    "elegant evening wear, or sleepwear that stays covered, in a warmly lit private scene",
  undressing_to_expose:
    "a change of wardrobe into evening wear or sleepwear, with the cast fully dressed",
  minor_or_ambiguous_age: null,
  non_consent: null,
  public_figure: null,
};

const MESSAGES: Readonly<Record<PolicyReasonCode, string>> = {
  explicit_sexual_act:
    "SceneFlow creates romantic scenes, not sexual ones. Your other choices have been kept.",
  explicit_nudity:
    "SceneFlow keeps everyone clothed and intimate anatomy covered. Your other choices have been kept.",
  undressing_to_expose:
    "SceneFlow can change what the cast is wearing, but it will not undress anyone. Your other choices have been kept.",
  minor_or_ambiguous_age:
    "This cannot be generated. SceneFlow works only with photographs of adults, and will not create a scene described this way.",
  non_consent:
    "This cannot be generated. Every scene SceneFlow creates has to read as willing and mutual.",
  public_figure:
    "SceneFlow will not create romantic scenes of public figures. Use photographs of people who have agreed to this.",
};

/** Hard refusals first, then escalation severity. */
const SEVERITY: readonly PolicyReasonCode[] = [
  "minor_or_ambiguous_age",
  "non_consent",
  "public_figure",
  "explicit_sexual_act",
  "explicit_nudity",
  "undressing_to_expose",
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Evaluate user-supplied text against the real-person boundary. */
export function evaluateText(input: string): PolicyVerdict {
  if (input.trim() === "") return ALLOWED;

  const { plain, folded, flat } = normalizeText(input);
  const hits = new Set<PolicyReasonCode>();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(plain) || pattern.test(folded)) {
        hits.add(rule.code);
        break;
      }
    }
  }

  for (const [code, term] of DESPACED) {
    if (flat.includes(term)) hits.add(code);
  }

  if (UNDER_18.test(plain)) hits.add("minor_or_ambiguous_age");

  if (hits.size === 0) return ALLOWED;

  const codes = SEVERITY.filter((c) => hits.has(c));
  const worst = codes[0];
  if (!worst) return ALLOWED;

  return {
    allowed: false,
    reasonCodes: codes,
    alternative: ALTERNATIVES[worst],
    hardRefusal: HARD_REFUSAL_CODES.includes(worst),
    message: MESSAGES[worst],
  };
}

export interface FieldVerdict {
  readonly verdict: PolicyVerdict;
  /** Which field produced the verdict, for the UI to highlight. null when allowed. */
  readonly field: string | null;
}

/**
 * Evaluate several user-supplied fields at once (a custom direction, a custom
 * wardrobe, a custom setting). The worst verdict wins: a clean direction does
 * not redeem a wardrobe field asking for nudity.
 */
export function evaluateFields(
  fields: Readonly<Record<string, string | undefined>>,
): FieldVerdict {
  let worst: PolicyVerdict = ALLOWED;
  let worstField: string | null = null;

  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const verdict = evaluateText(value);
    if (verdict.allowed) continue;
    if (worst.allowed || (verdict.hardRefusal && !worst.hardRefusal)) {
      worst = verdict;
      worstField = name;
    }
  }

  return { verdict: worst, field: worstField };
}

/**
 * The attestation gate (section 9). A cast may not generate until both boxes are
 * ticked.
 *
 * This records what the user stated. It verifies nothing, and the product says
 * so where it is collected: it is an application attestation, not proof of
 * consent, and it is never described as one.
 */
export function attestationSatisfied(cast: {
  readonly adultConfirmed: boolean;
  readonly permissionConfirmed: boolean;
}): boolean {
  return cast.adultConfirmed && cast.permissionConfirmed;
}
