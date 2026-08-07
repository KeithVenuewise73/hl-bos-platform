/**
 * The real Saffer engagement — the seed from the proven manual test run.
 *
 * TRUTH MODE. Every fact here is either a real public observation (with its
 * sources) or an explicit Unknown. NOTHING internal is invented: the internal
 * links carry `unknown`, because that is the honest state of the evidence. This
 * seed is what makes the end-to-end test a proof rather than a demo — BTI must
 * reach the same honest "collect more evidence" output a human consultant did.
 *
 * Public sources (captured 2026-08-06):
 *   - azbigmedia.com "Best plumbers in Baltimore: A 2026 homeowner's guide"
 *   - Google (via aggregator): 4.9★, ~666 reviews
 *   - Yelp: 83 reviews, 4247 Harford Rd, Baltimore MD 21214
 *   - Chamber of Commerce / BBB listings; official site safferplumbing.com
 */

import type { Engagement } from "./types.ts";

export const SAFFER_ENGAGEMENT: Engagement = {
  engagementId: "eng-saffer-0001",
  business: "Saffer Plumbing, Heating & Electrical (Baltimore, MD)",
  asOf: "2026-08-06",
  goal: {
    // No owner interview took place, so the goal is an explicit assumption.
    statement:
      "Grow profitable revenue without degrading the reputation built over 80 years.",
    metric: "profitable revenue growth",
    guardrail: "not at the cost of the 4.9-star reputation",
    confidence: "assumed",
  },
  evidence: [
    {
      id: "ev-context-age",
      fact: "Established 1946; ~80 years in operation; fourth-generation family-owned; three trades (plumbing, heating, electrical).",
      link: "context",
      quality: "verified",
      sources: ["safferplumbing.com", "chamberofcommerce.com"],
      capturedAt: "2026-08-06",
      validityWindowDays: 365,
    },
    {
      id: "ev-demand-reputation",
      fact: "[strong] 4.9-star rating across ~666 Google reviews — an elite reputation that drives strong inbound demand.",
      link: "demand",
      quality: "verified",
      sources: ["Google (via aggregator)", "Yelp (83 reviews)"],
      capturedAt: "2026-08-06",
      validityWindowDays: 180,
    },
    {
      id: "ev-demand-competitive",
      fact: "[strong] Leads Baltimore independents on reputation: more review volume than Benjamin Franklin (4.9/328); rating at or above peers; second in volume only to national Roto-Rooter (4.8/4,102).",
      link: "demand",
      quality: "verified",
      sources: ["azbigmedia.com", "web search"],
      capturedAt: "2026-08-06",
      validityWindowDays: 180,
    },
    {
      id: "ev-retention-base",
      fact: "[strong] A large, satisfied customer base is demonstrated by ~666 reviews at 4.9 stars accumulated over 80 years.",
      link: "retention",
      quality: "verified",
      sources: ["Google (via aggregator)", "Yelp (83 reviews)"],
      capturedAt: "2026-08-06",
      validityWindowDays: 180,
    },
    {
      id: "ev-capture-unknown",
      fact: "On-page capture mechanics (click-to-call, online booking, live chat) could not be verified — the website returned HTTP 403 to automated retrieval.",
      link: "capture",
      quality: "unknown",
    },
    {
      id: "ev-response-unknown",
      fact: "Average response time to inbound calls is not publicly observable.",
      link: "response",
      quality: "unknown",
    },
    {
      id: "ev-conversion-unknown",
      fact: "Quote-to-close rate is internal and not available from public information.",
      link: "conversion",
      quality: "unknown",
    },
    {
      id: "ev-fulfillment-unknown",
      fact: "Capacity utilisation, backlog and crew count are internal and not available from public information.",
      link: "fulfillment",
      quality: "unknown",
    },
    {
      id: "ev-margin-unknown",
      fact: "Pricing position and gross margin are internal and not available from public information.",
      link: "margin",
      quality: "unknown",
    },
  ],
};
