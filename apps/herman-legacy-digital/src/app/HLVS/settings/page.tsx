import { StudioShell } from "@/hlvs/components/StudioShell";
import { Card, Row, colors } from "@/hlvs/components/ui";
import { executiveOverview } from "@/hlvs/lib/intelligence";
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

/**
 * Sources & Settings.
 *
 * The purpose of this page is to make the boundary of what HLVS actually knows
 * visible. Everything listed is a source that has really run; everything under
 * "not connected" is named so its absence is a stated fact rather than an
 * assumption the CEO has to make for himself.
 */
export default async function Settings() {
  const intel = await executiveOverview();
  const n = (v: number) => v.toLocaleString();

  return (
    <StudioShell view="settings" path="/HLVS/settings">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Sources &amp; Settings</h1>
      <p style={{ color: colors.dim, fontSize: 13, marginTop: 0 }}>
        What HLVS has actually looked at, and what it has not.
      </p>

      <Card title="Connected sources" sub="Sources that have really run against live data">
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
        title="Not connected"
        sub="Named so their absence is a stated fact, not an assumption"
      >
        <Row k="Reddit" v="Not connected. No Reddit evidence is held, and none is implied anywhere in HLVS." />
        <Row k="Public forums and product discussions" v="Not connected." />
        <Row k="App and software reviews" v="Not connected." />
        <Row k="Search-interest data" v="Not connected. No search-volume figure appears anywhere." />
        <Row
          k="Package download counts"
          v="Not connected. Downloads are never shown, estimated or inferred."
        />
        <div style={{ fontSize: 12, color: colors.dim, marginTop: 10 }}>
          Each of these is a legitimate public source the brief names. Adding one widens the
          pain evidence; until then the pain points rest on GitHub issues alone, and every
          count on this platform reflects only that.
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
