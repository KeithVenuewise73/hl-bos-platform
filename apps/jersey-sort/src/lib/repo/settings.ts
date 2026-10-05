import {
  DEFAULT_THRESHOLDS,
  validateThresholds,
  type ConfidenceThresholds,
} from "@hl-bos/jersey-sort";

import type { Db } from "../db-core.ts";

export type ProviderSetting = "claude" | "local-ocr" | "none";

export interface OrgSettings {
  readonly thresholds: ConfidenceThresholds;
  /** null = use the app's default (see config.ts). */
  readonly provider: ProviderSetting | null;
}

export function getSettings(db: Db, org: string): OrgSettings {
  const row = db.get<{
    high_threshold: number;
    medium_threshold: number;
    provider: string | null;
  }>(
    "select high_threshold, medium_threshold, provider from organization_settings where organization_id = :org",
    { org },
  );
  if (row === undefined) return { thresholds: DEFAULT_THRESHOLDS, provider: null };
  const provider =
    row.provider === "claude" || row.provider === "local-ocr" || row.provider === "none"
      ? row.provider
      : null;
  return {
    thresholds: { high: row.high_threshold, medium: row.medium_threshold },
    provider,
  };
}

export function saveThresholds(db: Db, org: string, t: ConfidenceThresholds): void {
  const problem = validateThresholds(t);
  if (problem !== null) throw new Error(problem);
  db.run(
    `insert into organization_settings (organization_id, high_threshold, medium_threshold, updated_at)
     values (:org, :high, :medium, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     on conflict (organization_id) do update set high_threshold = :high, medium_threshold = :medium,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    { org, high: t.high, medium: t.medium },
  );
}

export function saveProvider(
  db: Db,
  org: string,
  provider: ProviderSetting | null,
): void {
  db.run(
    `insert into organization_settings (organization_id, provider) values (:org, :p)
     on conflict (organization_id) do update set provider = :p, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    { org, p: provider },
  );
}
