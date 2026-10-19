// The qualification gate. Nothing is silently discarded: a lead that fails a
// check is "excluded" with the reason shown, an unclear one goes to "needs
// review", and a reviewer can override either on the Lead Card.

import { matchChain } from "./chains.ts";
import { normalizePhone } from "./normalize.ts";
import { VERTICALS } from "./verticals.ts";
import type {
  PlaceRecord,
  Qualification,
  QualificationCheck,
  QualificationStatus,
  Vertical,
  WebsiteStatus,
} from "./types.ts";

export interface QualifyInput {
  name: string;
  vertical: Vertical;
  source: "google_places" | "import";
  place: PlaceRecord | undefined;
  phone: string | undefined;
  email: string | undefined;
  website: string | undefined;
  websiteStatus: WebsiteStatus;
  distanceMiles: number | undefined;
  radiusMiles: number;
}

export function verticalMatch(
  vertical: Vertical,
  name: string,
  place: PlaceRecord | undefined,
): { outcome: "pass" | "uncertain"; detail: string } {
  const spec = VERTICALS[vertical];
  const types = place
    ? [place.primaryType, ...place.types].filter((t): t is string => !!t)
    : [];
  const typeHit = types.find(
    (t) =>
      spec.placeTypes.includes(t) || spec.placeTypeSuffixes.some((s) => t.endsWith(s)),
  );
  if (typeHit)
    return {
      outcome: "pass",
      detail: `Google category "${typeHit}" is a ${spec.label} category.`,
    };
  const text = `${name} ${place?.primaryTypeLabel ?? ""}`;
  const kw = text.match(spec.keywords)?.[0];
  if (kw)
    return {
      outcome: "pass",
      detail: `"${kw}" in the business name or category suggests ${spec.label}.`,
    };
  return {
    outcome: "uncertain",
    detail: `Nothing in the name${place ? " or Google category" : ""} confirms this is a ${spec.label} business${place?.primaryTypeLabel ? ` (Google calls it "${place.primaryTypeLabel}")` : ""}.`,
  };
}

export function qualify(q: QualifyInput): Qualification {
  const checks: QualificationCheck[] = [];

  // Operating?
  const bs = q.place?.businessStatus;
  checks.push(
    bs === "OPERATIONAL"
      ? {
          code: "operating",
          label: "Operating",
          outcome: "pass",
          detail: "Google lists the business as operational.",
        }
      : bs === "CLOSED_PERMANENTLY"
        ? {
            code: "operating",
            label: "Operating",
            outcome: "fail",
            detail: "Google lists the business as permanently closed.",
          }
        : bs === "CLOSED_TEMPORARILY"
          ? {
              code: "operating",
              label: "Operating",
              outcome: "uncertain",
              detail: "Google lists the business as temporarily closed.",
            }
          : {
              code: "operating",
              label: "Operating",
              outcome: "unverified",
              detail:
                q.source === "import"
                  ? "Imported by a reviewer; operating status not verified."
                  : "Google did not report an operating status.",
            },
  );

  // Right vertical?
  if (q.source === "import" && !q.place) {
    checks.push({
      code: "vertical",
      label: "Matches the vertical",
      outcome: "unverified",
      detail:
        "Imported by a reviewer into this vertical; not verified against Google categories.",
    });
  } else {
    const v = verticalMatch(q.vertical, q.name, q.place);
    checks.push({
      code: "vertical",
      label: "Matches the vertical",
      outcome: v.outcome,
      detail: v.detail,
    });
  }

  // A legitimate way to reach them?
  const paths: string[] = [];
  if (normalizePhone(q.phone)) paths.push("phone");
  if (q.email) paths.push("email");
  if (q.website && q.websiteStatus !== "none")
    paths.push(q.websiteStatus === "social_only" ? "social page" : "website");
  checks.push(
    paths.length
      ? {
          code: "contact",
          label: "Has a contact path",
          outcome: "pass",
          detail: `Reachable by ${paths.join(", ")}.`,
        }
      : {
          code: "contact",
          label: "Has a contact path",
          outcome: "fail",
          detail: "No phone number, email or web address is known.",
        },
  );

  // National chain / franchise?
  const chain = matchChain(q.name, q.vertical);
  checks.push(
    chain
      ? {
          code: "chain",
          label: "Independent business",
          outcome: "fail",
          detail: `Looks like the national chain or franchise "${chain}"; the local branch does not control its own website. Override if this is wrong.`,
        }
      : {
          code: "chain",
          label: "Independent business",
          outcome: "pass",
          detail: "Not on the national chain and franchise list.",
        },
  );

  // Inside the radius?
  if (q.distanceMiles !== undefined) {
    const d = Math.round(q.distanceMiles * 10) / 10;
    checks.push(
      q.distanceMiles <= q.radiusMiles
        ? {
            code: "radius",
            label: "Inside the search radius",
            outcome: "pass",
            detail: `${d} miles from the market centre.`,
          }
        : {
            code: "radius",
            label: "Inside the search radius",
            outcome: "fail",
            detail: `${d} miles from the market centre, outside the ${q.radiusMiles}-mile radius.`,
          },
    );
  }

  return { computed: decide(checks), checks, override: undefined };
}

function decide(checks: QualificationCheck[]): QualificationStatus {
  if (checks.some((c) => c.outcome === "fail")) return "excluded";
  if (checks.some((c) => c.outcome === "uncertain")) return "needs_review";
  return "qualified";
}

/** The status that counts: a reviewer's override, else the automatic result. */
export function effectiveQualification(q: Qualification): QualificationStatus {
  return q.override?.status ?? q.computed;
}
