// Lead attribution: which channel a lead came through.
//
// Reads only what the visitor's own browser sent with the inquiry — the landing
// page URL (UTM parameters, Google Ads click id) and the referrer. No
// fingerprinting, no third-party lookup. A missing signal is `unknown`, never
// guessed into a channel that flatters a campaign.
//
// Google Business Profile traffic is identified only by the UTM tags HLG puts
// on the profile's website link (utm_source=google&utm_medium=organic&
// utm_campaign=gbp, or utm_source=gbp). Google does not otherwise mark it.

import type { Channel } from "./types.ts";

export interface TouchInput {
  landingUrl: string | undefined;
  referrer: string | undefined;
  /** ISO timestamp of the visit. */
  at: string;
}

export interface Touch {
  channel: Channel;
  at: string;
  source: string | undefined;
  medium: string | undefined;
  campaign: string | undefined;
  /** Google Ads click id, when present. Needed for offline conversion import. */
  gclid: string | undefined;
  evidence: string;
}

function parse(u: string | undefined): URL | undefined {
  if (!u) return undefined;
  try {
    return new URL(u);
  } catch {
    return undefined;
  }
}

const SOCIAL =
  /(^|\.)(facebook|instagram|linkedin|x|twitter|tiktok|youtube|nextdoor)\.com$/;
const SEARCH = /(^|\.)google\.[a-z.]+$/;

export function classifyTouch(t: TouchInput): Touch {
  const landing = parse(t.landingUrl);
  const ref = parse(t.referrer);
  const q = landing?.searchParams;
  const source = q?.get("utm_source")?.toLowerCase() ?? undefined;
  const medium = q?.get("utm_medium")?.toLowerCase() ?? undefined;
  const campaign = q?.get("utm_campaign")?.toLowerCase() ?? undefined;
  const gclid = q?.get("gclid") ?? q?.get("gbraid") ?? q?.get("wbraid") ?? undefined;
  const base = { at: t.at, source, medium, campaign, gclid };

  if (gclid)
    return {
      ...base,
      channel: "google_ads",
      evidence: "Landing URL carries a Google Ads click id.",
    };
  if (source === "gbp" || campaign === "gbp" || campaign === "google_business_profile")
    return {
      ...base,
      channel: "google_business_profile",
      evidence: "Landing URL carries the Business Profile UTM tag.",
    };
  if (medium === "cpc" || medium === "ppc" || medium === "paid") {
    return source === "google"
      ? {
          ...base,
          channel: "google_ads",
          evidence: `utm_medium=${medium}, utm_source=google.`,
        }
      : {
          ...base,
          channel: "other",
          evidence: `Paid traffic from ${source ?? "an unnamed source"}.`,
        };
  }
  if (medium === "email" || source === "outreach")
    return {
      ...base,
      channel:
        campaign?.startsWith("disc") || source === "outreach"
          ? "discovery_outreach"
          : "email",
      evidence: `utm_medium=${medium ?? ""}, utm_source=${source ?? ""}.`,
    };
  if (medium === "referral" || source === "referral")
    return { ...base, channel: "referral", evidence: "Tagged as a referral." };
  if (medium === "social" || (source && SOCIAL.test(`${source}.com`)))
    return {
      ...base,
      channel: "social",
      evidence: `Tagged social (${source ?? medium ?? ""}).`,
    };

  if (ref) {
    const host = ref.hostname.toLowerCase();
    if (SEARCH.test(host))
      return {
        ...base,
        channel: "google_organic",
        evidence: `Referred by ${host}, untagged.`,
      };
    if (SOCIAL.test(host))
      return { ...base, channel: "social", evidence: `Referred by ${host}.` };
    if (landing && host === landing.hostname.toLowerCase())
      return { ...base, channel: "direct", evidence: "Internal navigation only." };
    return { ...base, channel: "referral", evidence: `Referred by ${host}.` };
  }
  if (landing)
    return {
      ...base,
      channel: "direct",
      evidence: "No referrer and no campaign tags.",
    };
  return {
    ...base,
    channel: "unknown",
    evidence: "No landing page or referrer was recorded.",
  };
}

export interface Attribution {
  firstTouch: Touch | undefined;
  lastTouch: Touch | undefined;
  touches: Touch[];
}

/** First- and last-touch over a lead's recorded visits. */
export function attribute(visits: TouchInput[]): Attribution {
  const touches = visits.map(classifyTouch).sort((a, b) => a.at.localeCompare(b.at));
  // "direct" after a known channel does not overwrite it for last touch —
  // the standard last-non-direct rule.
  const nonDirect = touches.filter(
    (t) => t.channel !== "direct" && t.channel !== "unknown",
  );
  return {
    firstTouch: touches[0],
    lastTouch: nonDirect[nonDirect.length - 1] ?? touches[touches.length - 1],
    touches,
  };
}
