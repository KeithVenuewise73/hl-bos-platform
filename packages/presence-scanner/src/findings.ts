// Findings from Google Places and from an import. (Website findings are in
// website.ts.) Each one says where it came from and when.

import { formatPhone, normalizePhone } from "./normalize.ts";
import type { Candidate, Finding, FindingStatus, PlaceRecord } from "./types.ts";

const G = "Google Maps";

function g(
  key: string,
  label: string,
  status: FindingStatus,
  evidence: string,
  at: string,
  confidence: Finding["confidence"] = "high",
): Finding {
  return {
    key,
    label,
    status,
    source: "google_places",
    observedAt: at,
    evidence,
    confidence,
  };
}

/** Findings from a Places record. A field we did not request is "not checked". */
export function placeFindings(p: PlaceRecord, at: string): Finding[] {
  const asked = (f: string) => p.requestedFields.includes(`places.${f}`);
  const out: Finding[] = [];

  if (p.primaryTypeLabel || p.primaryType)
    out.push(
      g(
        "places.category",
        `Google category: ${p.primaryTypeLabel ?? p.primaryType}`,
        "present",
        `${G} lists the primary category as "${p.primaryTypeLabel ?? p.primaryType}".`,
        at,
      ),
    );

  if (asked("businessStatus"))
    out.push(
      p.businessStatus
        ? g(
            "places.business_status",
            `Google status: ${p.businessStatus.replace(/_/g, " ").toLowerCase()}`,
            "present",
            `${G} business status is ${p.businessStatus}.`,
            at,
          )
        : g(
            "places.business_status",
            "Google status not reported",
            "not_checked",
            `${G} returned no business status.`,
            at,
            "low",
          ),
    );

  if (asked("websiteUri"))
    out.push(
      p.website
        ? g(
            "places.website",
            "Website on Google profile",
            "present",
            `${G} lists ${p.website}.`,
            at,
          )
        : g(
            "places.website",
            "No website on Google profile",
            "missing",
            `${G} lists no website for this business.`,
            at,
          ),
    );
  if (asked("nationalPhoneNumber"))
    out.push(
      p.phone
        ? g(
            "places.phone",
            "Phone on Google profile",
            "present",
            `${G} lists ${p.phone}.`,
            at,
          )
        : g(
            "places.phone",
            "No phone on Google profile",
            "missing",
            `${G} lists no phone number.`,
            at,
          ),
    );
  if (p.hasHours !== undefined)
    out.push(
      p.hasHours
        ? g(
            "places.hours",
            "Opening hours on Google profile",
            "present",
            `${G} lists regular opening hours.`,
            at,
          )
        : g(
            "places.hours",
            "No opening hours on Google profile",
            "missing",
            `${G} lists no regular opening hours.`,
            at,
          ),
    );
  if (p.photoCount !== undefined)
    out.push(
      p.photoCount > 0
        ? g(
            "places.photos",
            `Photos on Google profile (${p.photoCount === 10 ? "10+" : p.photoCount})`,
            "present",
            `${G} returned ${p.photoCount} photo reference(s) (Google returns at most 10).`,
            at,
          )
        : g(
            "places.photos",
            "No photos on Google profile",
            "missing",
            `${G} returned no photos.`,
            at,
          ),
    );

  // Google omits BOTH rating and count when a place has no reviews.
  if (asked("rating") && asked("userRatingCount")) {
    if (p.reviewCount === undefined && p.rating === undefined) {
      out.push(
        g(
          "places.reviews",
          "No Google reviews",
          "missing",
          `${G} returned no rating and no review count, which is how it reports a place with no reviews.`,
          at,
          "medium",
        ),
      );
    } else {
      out.push(
        g(
          "places.reviews",
          `Google rating ${p.rating?.toFixed(1) ?? "n/a"} from ${p.reviewCount ?? "an unknown number of"} review${p.reviewCount === 1 ? "" : "s"}`,
          "present",
          `${G}: rating ${p.rating ?? "not given"}, ${p.reviewCount ?? "count not given"} reviews.`,
          at,
        ),
      );
    }
  }
  return out;
}

/** Review figures for scoring: Google wins over an import. */
export function reviewFigures(
  place: PlaceRecord | undefined,
  c: Pick<Candidate, "importedRating" | "importedReviewCount">,
):
  | { rating: number | undefined; count: number | undefined; findingKeys: string[] }
  | undefined {
  if (place && place.requestedFields.includes("places.userRatingCount")) {
    const none = place.reviewCount === undefined && place.rating === undefined;
    return {
      rating: place.rating,
      count: none ? 0 : place.reviewCount,
      findingKeys: ["places.reviews"],
    };
  }
  if (c.importedRating !== undefined || c.importedReviewCount !== undefined)
    return {
      rating: c.importedRating,
      count: c.importedReviewCount,
      findingKeys: ["import.reviews"],
    };
  return undefined;
}

/** Findings recorded from an import (what the reviewer typed in). */
export function importFindings(c: Candidate, at: string): Finding[] {
  const out: Finding[] = [];
  const imp = (
    key: string,
    label: string,
    status: FindingStatus,
    evidence: string,
  ): Finding => ({
    key,
    label,
    status,
    source: "import",
    observedAt: at,
    evidence,
    confidence: "medium",
  });
  if (c.importedRating !== undefined || c.importedReviewCount !== undefined)
    out.push(
      imp(
        "import.reviews",
        `Rating ${c.importedRating ?? "n/a"} from ${c.importedReviewCount ?? "?"} reviews (as imported)`,
        "present",
        "Typed into the imported list by a reviewer; not verified against Google.",
      ),
    );
  const phone = formatPhone(normalizePhone(c.phone));
  if (phone)
    out.push(
      imp(
        "import.phone",
        `Phone ${phone} (as imported)`,
        "present",
        "From the imported list.",
      ),
    );
  return out;
}
