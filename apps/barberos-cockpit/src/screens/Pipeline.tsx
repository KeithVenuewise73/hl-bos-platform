"use client";

import { useState } from "react";

import { pipeline, type Agency, type PipelineEntry } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import {
  STAGES,
  groupByStage,
  isWhollyInferred,
  scoreDisplay,
  when,
} from "@/lib/model";
import { EmptyState } from "@/components/ui";
import { Loaded, PageHead } from "@/components/parts";

/**
 * Screen 1 — the board.
 *
 * A prospect's column IS its stage, derived from facts (was the call answered,
 * did a run finish, does a proposal exist, was it accepted, does a shop record
 * exist) rather than from a status field somebody has to remember to update.
 */
export default function Pipeline({
  agency,
  onOpen,
  onIntake,
}: {
  agency: Agency;
  onOpen: (prospectId: string) => void;
  onIntake: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const state = useAsync(
    () => pipeline(agency.tenant_id, query),
    [agency.tenant_id, query],
  );

  return (
    <>
      <PageHead
        title="Pipeline"
        sub={`${agency.name} — every shop, and the furthest stage it has actually reached.`}
        action={
          agency.can.manage_shops ? (
            <button className="btn primary" onClick={onIntake}>
              + Add a shop
            </button>
          ) : (
            <span className="dim" style={{ fontSize: 12 }}>
              You cannot add shops for this agency
            </span>
          )
        }
      />

      <form
        className="row"
        style={{ marginBottom: 16, maxWidth: 460 }}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
        }}
      >
        <input
          type="search"
          placeholder="Search by shop name or town"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn" type="submit">
          Search
        </button>
        {query && (
          <button
            className="btn sm"
            type="button"
            onClick={() => {
              setSearch("");
              setQuery("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      <Loaded
        state={state}
        isEmpty={(d: PipelineEntry[]) => d.length === 0}
        empty={
          <EmptyState title={query ? "Nothing matched that search" : "No shops yet"}>
            {query
              ? "No shop in this agency's list matches. Try a shorter search."
              : "Nothing has been imported for this agency. Add a shop to start a pipeline — this board only ever shows shops that really exist in the database."}
          </EmptyState>
        }
      >
        {(entries) => {
          const grouped = groupByStage(entries);
          return (
            <>
              <div className="board">
                {STAGES.map((s) => (
                  <div className="board-col" key={s.key}>
                    <div className="board-head">
                      <span className="t">{s.label}</span>
                      <span className="n">{grouped[s.key].length}</span>
                    </div>
                    {grouped[s.key].length === 0 ? (
                      <div
                        className="dim"
                        style={{ fontSize: 11.5, padding: "4px 2px" }}
                      >
                        {s.hint}
                      </div>
                    ) : (
                      grouped[s.key].map((e) => (
                        <button
                          className="board-card"
                          key={e.prospect_id}
                          onClick={() => onOpen(e.prospect_id)}
                        >
                          <div className="nm">{e.business_name}</div>
                          <div className="mt">
                            {[e.locality, e.region].filter(Boolean).join(", ") ||
                              "no location on file"}
                          </div>
                          <div className="row" style={{ gap: 5, marginTop: 6 }}>
                            {e.latest_run && (
                              <span
                                className={`badge ${
                                  scoreDisplay(e.latest_run).complete ? "info" : "warn"
                                }`}
                              >
                                {scoreDisplay(e.latest_run).value === "—"
                                  ? "not scored"
                                  : `${scoreDisplay(e.latest_run).value}/100`}
                              </span>
                            )}
                            {e.latest_run?.status === "running" && (
                              <span className="badge warn">audit running</span>
                            )}
                            {isWhollyInferred(e.latest_run) && (
                              <span
                                className="badge warn"
                                title="No finding in this run carries an evidence URL"
                              >
                                inferred only
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                ))}
              </div>

              <h3 className="section-title" style={{ marginTop: 26 }}>
                All {entries.length} shop{entries.length === 1 ? "" : "s"}
              </h3>
              <div className="card">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Shop</th>
                      <th>Where</th>
                      <th>Called</th>
                      <th>Audit</th>
                      <th>Evidence</th>
                      <th>Proposal</th>
                      <th>Client since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const d = scoreDisplay(e.latest_run);
                      return (
                        <tr
                          key={e.prospect_id}
                          style={{ cursor: "pointer" }}
                          onClick={() => onOpen(e.prospect_id)}
                        >
                          <td style={{ fontWeight: 600 }}>{e.business_name}</td>
                          <td className="muted">
                            {[e.locality, e.region].filter(Boolean).join(", ") || "—"}
                          </td>
                          <td className="muted">{when(e.discovery?.answered_at)}</td>
                          <td>
                            {e.latest_run ? (
                              <>
                                {d.value}
                                {d.value !== "—" && "/100"}
                                <div className="dim" style={{ fontSize: 11 }}>
                                  {d.qualifier}
                                </div>
                              </>
                            ) : (
                              <span className="dim">not audited</span>
                            )}
                          </td>
                          <td className="muted">
                            {e.latest_run
                              ? `${e.latest_run.evidenced_findings} of ${e.latest_run.findings} evidenced`
                              : "—"}
                          </td>
                          <td className="muted">
                            {e.latest_proposal ? e.latest_proposal.status : "—"}
                          </td>
                          <td className="muted">{when(e.onboarding?.onboarded_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </Loaded>
    </>
  );
}
