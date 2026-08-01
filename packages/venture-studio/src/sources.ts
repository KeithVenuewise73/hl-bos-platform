/**
 * Discovery source registry — IN-CODE for V2-1 (no connectors yet).
 *
 * V2-1 has no external ingestion, so there is nothing to persist. This constant
 * powers the read-only "source status" page: every source shows as
 * `not_connected` and produces no data — honestly, never a fabricated count.
 * When V2-2 adds connectors, each source binds to an `integrations.connector`.
 */

export type SourceTier = "public" | "auth" | "sensitive";
export type SourceStatus = "not_connected";

export interface DiscoverySource {
  key: string;
  name: string;
  tier: SourceTier;
  /** Why the tier — drives the connect order and the legal posture. */
  posture: string;
  status: SourceStatus;
}

/** The 13 sources from the architecture. All `not_connected` in V2-1. */
export const DISCOVERY_SOURCES: DiscoverySource[] = [
  {
    key: "github",
    name: "GitHub",
    tier: "public",
    posture: "Public API; no auth for public repos.",
    status: "not_connected",
  },
  {
    key: "hacker_news",
    name: "Hacker News",
    tier: "public",
    posture: "Algolia HN API; public.",
    status: "not_connected",
  },
  {
    key: "arxiv",
    name: "arXiv (AI research)",
    tier: "public",
    posture: "Public export API.",
    status: "not_connected",
  },
  {
    key: "uspto",
    name: "USPTO",
    tier: "public",
    posture: "Public patent data API.",
    status: "not_connected",
  },
  {
    key: "sbir_sttr",
    name: "SBIR/STTR",
    tier: "public",
    posture: "Public federal award data.",
    status: "not_connected",
  },
  {
    key: "grants",
    name: "Grants.gov",
    tier: "public",
    posture: "Public grant listings API.",
    status: "not_connected",
  },
  {
    key: "oss",
    name: "Open-source repositories",
    tier: "public",
    posture: "Public metadata.",
    status: "not_connected",
  },
  {
    key: "reddit",
    name: "Reddit",
    tier: "auth",
    posture: "OAuth + rate limits.",
    status: "not_connected",
  },
  {
    key: "product_hunt",
    name: "Product Hunt",
    tier: "auth",
    posture: "API token required.",
    status: "not_connected",
  },
  {
    key: "yc",
    name: "Y Combinator",
    tier: "auth",
    posture: "Directory access; rate-limited.",
    status: "not_connected",
  },
  {
    key: "acquire",
    name: "Acquire.com",
    tier: "sensitive",
    posture: "ToS-restricted; requires explicit legal go-ahead.",
    status: "not_connected",
  },
  {
    key: "indie_hackers",
    name: "IndieHackers",
    tier: "sensitive",
    posture: "ToS-sensitive; no official API.",
    status: "not_connected",
  },
  {
    key: "startup_dbs",
    name: "Startup databases",
    tier: "sensitive",
    posture: "Commercial licensing likely required.",
    status: "not_connected",
  },
];

export function sourceByKey(key: string): DiscoverySource | undefined {
  return DISCOVERY_SOURCES.find((s) => s.key === key);
}
