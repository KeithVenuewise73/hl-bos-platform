/**
 * Turns engineering failure output into a sentence a CEO can act on.
 *
 * The rule: say what broke, why, and who has to do something. Never show a
 * constraint name, a stack trace, or a SQLSTATE as the headline. Those go in
 * `detail`, collapsed, for whoever debugs it.
 *
 * Every rule here comes from a failure we ACTUALLY hit while building HL-BOS.
 * This is not a guess at what might break -- it is the log of what did.
 */

export type Owner = "ai-engineer" | "ceo";

export interface Explained {
  /** One sentence. No jargon. */
  headline: string;
  /** What happens next, in plain language. */
  meaning: string;
  /** Who has to act. Most things are not the CEO's problem. */
  owner: Owner;
  /** The raw text, for the engineer. Never shown by default. */
  detail: string;
}

interface Rule {
  match: RegExp;
  headline: string;
  meaning: string;
  owner: Owner;
}

const RULES: readonly Rule[] = [
  // --- Social publishing (module 0046) --------------------------------
  // These are the failure modes the social module can actually produce. Each
  // one names who has to act, because three of the four are settings only
  // Keith can change and one is genuinely ours.
  {
    match: /manual_reauth_required/i,
    headline: "A social account needs you to sign in again before it can post.",
    meaning:
      "Social platforms expire their permissions every couple of months, and LinkedIn will not let software renew a personal profile's permission on its own. Nothing is broken and nothing has been lost — but posts to that account will stop unless it is re-authorised. You will be shown a button to do it.",
    owner: "ceo",
  },
  {
    match: /ambiguous: no response from|ambiguous: request timed out/i,
    headline:
      "A post was sent but the platform never confirmed it. Somebody should look at the page.",
    meaning:
      "The request went out and the answer never came back, so we genuinely do not know whether it published. We deliberately did NOT try again, because trying again is how one post becomes two. Check the channel: if it is not there, it can be re-sent safely.",
    owner: "ai-engineer",
  },
  {
    match: /url_ownership_unverified/i,
    headline:
      "TikTok will not accept our videos until the website address is verified with them.",
    meaning:
      "TikTok only pulls video from a domain it has confirmed we own. This is a one-time setting in the TikTok developer portal, not a fault in the software. Facebook, Instagram and LinkedIn are unaffected.",
    owner: "ceo",
  },
  {
    match: /accounts_instagram_requires_linked_page/i,
    headline:
      "That Instagram account cannot post automatically because it is not linked to a Facebook Page.",
    meaning:
      "Instagram only allows software to publish from a Professional account (Business or Creator) that is connected to a Facebook Page. A personal account cannot do it at all — this is Instagram's rule, not ours. Converting the account and linking it is done in the Instagram app.",
    owner: "ceo",
  },
  {
    match: /tiktok_inbox target cannot be published|delivered_to_inbox applies only/i,
    headline: "Something tried to treat a TikTok draft as if it were a live post.",
    meaning:
      "TikTok videos are delivered to the account's inbox as drafts, and a person publishes them from the app. The platform refused to record one as published. That guard worked; the code that called it needs fixing.",
    owner: "ai-engineer",
  },
  {
    match: /instagram requires an image|tiktok inbox upload requires a video/i,
    headline:
      "A post was scheduled to a channel that will not accept it without media.",
    meaning:
      "Instagram cannot publish text on its own, and TikTok needs a video. The post was stopped before it was sent rather than failing repeatedly. Adding the image or video and re-approving fixes it.",
    owner: "ai-engineer",
  },
  {
    match:
      /users_email_partial_key|duplicate key value violates unique constraint "users_email/i,
    headline: "A test tried to create two accounts with the same email address.",
    meaning:
      "Supabase does not allow two password accounts to share an email, so the test could not set up the situation it wanted to check. It is a fault in the test, not in the platform. No customer data is affected.",
    owner: "ai-engineer",
  },
  {
    match: /duplicate key value violates unique constraint/i,
    headline: "Something was created twice that is only allowed to exist once.",
    meaning:
      "The database refused a duplicate. This protected your data rather than corrupting it.",
    owner: "ai-engineer",
  },
  {
    match:
      /violates row-level security policy|permission denied for table|permission denied for schema/i,
    headline: "The security rules blocked an action that was not permitted.",
    meaning:
      "This is usually the platform working correctly. If it happened during a test, the test is asserting that the block works.",
    owner: "ai-engineer",
  },
  {
    match: /Resource not accessible by integration|HttpError.*403/i,
    headline: "GitHub refused a request because of a permissions setting.",
    meaning:
      "An automated check needs slightly different access. It is a configuration fix, not a code fault.",
    owner: "ai-engineer",
  },
  {
    match: /planned \d+ tests but ran \d+/i,
    headline: "A test run stopped early because an earlier step failed.",
    meaning:
      "This message is a symptom, not the cause. The real failure is above it in the log.",
    owner: "ai-engineer",
  },
  {
    match: /ERR_PNPM_NO_MATCHING_VERSION|No matching version found/i,
    headline: "A software library version was requested that does not exist.",
    meaning: "A typo or a bad assumption in a version number. Quick fix.",
    owner: "ai-engineer",
  },
  {
    match: /Code style issues found|prettier/i,
    headline: "Some files were not formatted to the house style.",
    meaning: "Cosmetic only. It does not affect how the software behaves.",
    owner: "ai-engineer",
  },
  {
    match:
      /could not read Username for 'https:\/\/github\.com'|Authentication failed|could not read Password/i,
    headline: "GitHub could not confirm who you are.",
    meaning:
      "Your GitHub sign-in needs renewing. You will be asked to approve it in the browser.",
    owner: "ceo",
  },
  {
    match: /nothing to commit|working tree clean/i,
    headline: "There are no new changes to send.",
    meaning: "Everything on this machine is already saved to GitHub.",
    owner: "ceo",
  },
  {
    match: /rejected.*non-fast-forward|Updates were rejected/i,
    headline: "GitHub has newer work than this machine does.",
    meaning:
      "Someone (or an automated update) changed things on GitHub. The newer work needs pulling in first.",
    owner: "ai-engineer",
  },
  {
    match: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i,
    headline: "Could not reach an outside service.",
    meaning: "Usually a temporary network problem. Trying again often works.",
    owner: "ceo",
  },
];

const FALLBACK: Omit<Explained, "detail"> = {
  headline:
    "Something failed that HL-BOS does not have a plain-English explanation for yet.",
  meaning:
    "This is not your problem to solve. Send the details to your AI engineer -- and the fact that no explanation exists is itself worth fixing.",
  owner: "ai-engineer",
};

/** Explain a raw engineering error. Never returns jargon as the headline. */
export function explain(raw: string): Explained {
  const text = (raw ?? "").trim();
  if (text === "") {
    return { ...FALLBACK, detail: "(no output)" };
  }
  for (const rule of RULES) {
    if (rule.match.test(text)) {
      return {
        headline: rule.headline,
        meaning: rule.meaning,
        owner: rule.owner,
        detail: text,
      };
    }
  }
  return { ...FALLBACK, detail: text };
}

/** True when the CEO personally has to do something about this. */
export function needsCeo(e: Explained): boolean {
  return e.owner === "ceo";
}

/** How many rules exist. Surfaced so gaps in coverage are visible, not hidden. */
export const RULE_COUNT = RULES.length;
