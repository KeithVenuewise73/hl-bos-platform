// Display labels, kept free of engine code so the browser can import them
// ("@hl-bos/presence-scanner/labels") without pulling in the scanner.

import type { Vertical, WebsiteStatus } from "./types.ts";

export { LEAD_STAGES, STAGE_TO_HLBOS, stageLabel } from "./stages.ts";
import { VERTICALS } from "./verticals.ts";

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, string> = {
  none: "No website",
  social_only: "Facebook/social only",
  link_in_bio: "Link-in-bio only",
  retired_google_site: "Retired Google site",
  ok: "Working website",
  unreachable: "Broken / unreachable",
  blocked: "Could not inspect",
  not_checked: "Not checked",
};

export const QUALIFICATION_LABELS = {
  qualified: "Qualified",
  excluded: "Excluded",
  needs_review: "Needs review",
} as const;

export const VERTICAL_LABELS = Object.fromEntries(
  Object.values(VERTICALS).map((v) => [v.key, v.label]),
) as Record<Vertical, string>;
