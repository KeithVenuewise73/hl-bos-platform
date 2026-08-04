/**
 * Sample intake + scripted fetch outcomes for tests and the internal preview.
 * Clearly illustrative, never a live client (Principle 10). The website HTML is
 * the real snapshot shipped by @hl-bos/bti-engine, so the analysis reasons over
 * genuine signals.
 */

import { analyst } from "@hl-bos/bti-engine";
import type { SiteFetchResult } from "./evidence.ts";
import type { NormalizedIntake } from "./types.ts";

export const SAMPLE_INTAKE: NormalizedIntake = {
  submissionId: "00000000-0000-0000-0000-0000000000aa",
  submissionRef: "HLD-BT-SAMPLE",
  contact: {
    businessName: "Rivertown Logistics",
    primaryContact: "Dana Rivera",
    email: "dana@rivertown-logistics.example.com",
    phone: "+1-614-555-0100",
  },
  website: "https://rivertown-logistics.example.com",
  industry: "Transportation & Logistics",
  businessStage: "10–25 years",
  mainChallenge: "We rely on referrals and can't get found online by new shippers.",
  ninetyDayGoal: "Book two new recurring freight accounts.",
  growthPriority: "Leads",
  socialLinks: ["https://facebook.com/rivertownlogistics"],
  consentPublicReview: true,
  submittedAt: "2026-08-04T12:00:00.000Z",
};

/** The homepage HTML the sample site returns (real bti-engine snapshot). */
export const SAMPLE_SITE_HTML = analyst.SAMPLE_HTML;

/** Fetch outcomes for the three canonical scenarios. */
export const fetchCollected = (): SiteFetchResult => ({
  outcome: "ok",
  html: SAMPLE_SITE_HTML,
});

export const fetchBlocked = (): SiteFetchResult => ({
  outcome: "blocked",
  reason: "403",
});

export const fetchNoUrl = (): SiteFetchResult => ({ outcome: "no_url" });
