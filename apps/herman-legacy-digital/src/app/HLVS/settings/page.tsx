import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Row, Empty, colors } from "@/hlvs/components/ui";
import { executiveOverview, painSources } from "@/hlvs/lib/intelligence";
import {
  MATRIX_VERSION,
  DISCOVERY_QUERIES,
  DISCOVERY_CATEGORIES,
  SCORING_VERSION,
  PAIN_ENGINE_VERSION,
  PAIN_PHRASES,
  PAIN_THEMES,
} from "@hl-bos/venture-studio";

export const dynamic = "force-dynamic";

/** The six source states, in words a non-engineer can act on. */
const STATE_LABEL: Record<string, string> = {
  connected: "CONNECTED",
  accessible_not_connected: "REACHABLE, NOT YET COLLECTED",
  requires_credential: "NEEDS A CREDENTIAL",
  technically_restricted: "BLOCKED BY NETWORK POLICY",
  tos_review_required: "NEEDS A TERMS REVIEW",
  not_currently_feasible: "NOT CURRENTLY FEASIBLE",
};

/**
 * Sources & Settings.
 *
 * The purpose of this page is to make the boundary of what HLVS actually knows
 * visible. Everything listed is a source that has really run; everything under
 * "not connected" is named so its absence is a stated fact rather than an
 * assumption the CEO has to make for himself.
 */
export default async function Settings() {
  const [intel, sources] = await Promise.all([executiveOverview(), painSources()]);
  const n = (v: number) => v.toLocaleString();

  return (
    <StudioShell view="settings" path="/HLVS/settings">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Sources &amp; Settings</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        What HLVS has actually looked at, and what it has not.
      </p>

      <Card
        title="Connected sources"
        sub="Sources that have really run against live data"
      >
        <Row
          k="GitHub repository search"
          v={`${n(intel.corpus)} opportunities · matrix ${MATRIX_VERSION} · ${DISCOVERY_QUERIES.length} queries across ${DISCOVERY_CATEGORIES.length} categories`}
        />
        <Row
          k="GitHub issue search"
          v={`${n(intel.painSignals)} verified pain signals · engine ${PAIN_ENGINE_VERSION} · ${PAIN_PHRASES.length} phrasings, ${PAIN_THEMES.length} themes`}
        />
        <Row
          k="Repository metric observations"
          v={`${n(intel.observations)} readings recorded — growth needs two of them for the same repository`}
        />
      </Card>

      <Card
        title="Every public source, and what is actually blocking each one"
        sub="Read from vstudio.pain_sources — the registry is data, not copy on a page"
      >
        {sources.error ? (
          <div style={{ fontSize: 12, color: colors.warn }}>
            The source registry could not be read: {sources.error}. This is a failed
            read, not an empty registry.
          </div>
        ) : sources.sources.length === 0 ? (
          <Empty>No source has been registered yet.</Empty>
        ) : (
          sources.sources.map((src) => (
            <Row
              key={src.key}
              k={src.label}
              v={`${STATE_LABEL[src.state] ?? src.state} — ${src.state_reason}${
                src.notes ? ` ${src.notes}` : ""
              }`}
            />
          ))
        )}
        <div style={{ fontSize: 12, color: colors.dim, marginTop: 10 }}>
          A source reads <strong>connected</strong> only when a real collection stored
          real rows. Every other state names the specific obstacle rather than implying
          the data might be there. Reddit, Hacker News, the app stores and
          Stack&nbsp;Overflow were each probed on 2026-08-20 and every one was refused
          by this environment&rsquo;s egress policy — that is a network permission, not
          a missing credential.
        </div>
      </Card>

      <Card title="Scoring" sub="The engine that produces the two scores">
        <Row k="Scoring version" v={SCORING_VERSION} />
        <Row
          k="Popularity / market evidence"
          v="Measured from repository metrics: stars, forks, open issues, push recency, declared topics. Stars are log-normalized and blended with rank inside the record's own category, so one very large repository cannot dominate every category."
        />
        <Row
          k="HLG suitability"
          v="Estimated — never measured. A structured inference from domain vocabulary, stack overlap, licence terms, project scale, the discovery pattern that found it, and commercial-shape topics."
        />
        <Row
          k="Rising"
          v="Measured only where two observations of the same repository exist, at least half a day apart. Otherwise unknown, never flat."
        />
        <Row
          k="Never inferred"
          v="Market size, revenue, customers, downloads, pricing, willingness to pay, competitive claims. No score on this platform licenses any of them."
        />
      </Card>
    </StudioShell>
  );
}
