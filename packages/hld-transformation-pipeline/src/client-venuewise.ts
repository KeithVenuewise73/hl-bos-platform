/**
 * Client #1 — Venuewise. Reuses the merged Venuewise engagement verbatim; the
 * pipeline adds no new Venuewise evidence and invents nothing. This is the
 * single wiring point that runs Venuewise through the whole pipeline.
 */

import { VENUEWISE_ENGAGEMENT } from "@hl-bos/bti-venuewise";
import type { StartupEngagement } from "@hl-bos/bti-venuewise";

export const VENUEWISE_CLIENT: StartupEngagement = VENUEWISE_ENGAGEMENT;
