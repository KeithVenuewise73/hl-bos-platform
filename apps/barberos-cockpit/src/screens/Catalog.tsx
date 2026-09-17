"use client";

import { catalog, type Catalog as Cat } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { bundleStatus, capabilityBlocker } from "@/lib/model";
import { Card, EmptyState } from "@/components/ui";
import { Loaded, PageHead } from "@/components/parts";

/**
 * Screen 14 — what we can honestly sell.
 *
 * The catalog, read straight out of the database with nothing added. Its
 * purpose on this screen is one number: how many capabilities have actually
 * shipped. Everything a proposal may claim, and everything a shop may have
 * switched on, is bounded by that number, and an operator who does not know it
 * will over-promise.
 */
export default function CatalogScreen() {
  const state = useAsync(() => catalog(), []);

  return (
    <>
      <PageHead
        title="Capability catalog"
        sub="The whole BarberOS product surface and its real state. This is the only vocabulary a proposal may use — the database rejects a document that names anything else."
      />

      <Loaded
        state={state}
        empty={<EmptyState title="The catalog could not be read" />}
      >
        {(c: Cat) => {
          const shipped = c.capabilities.filter((x) => x.status === "available");
          const planned = c.capabilities.filter((x) => x.status === "planned");
          const deferred = c.capabilities.filter((x) => x.status === "deferred");
          const ceoBlocked = planned.filter((x) => x.blocker_owner === "ceo");
          const engBlocked = planned.filter((x) => x.blocker_owner === "engineering");

          const byCategory = new Map<string, typeof c.capabilities>();
          for (const cp of c.capabilities) {
            byCategory.set(cp.category, [...(byCategory.get(cp.category) ?? []), cp]);
          }

          return (
            <>
              <div className="grid cols-4" style={{ marginBottom: 20 }}>
                <div className="stat">
                  <div className="stat-label">Shipped — sellable as available</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {shipped.length}
                  </div>
                  <div className="stat-sub">
                    {shipped.map((x) => x.name).join(", ") || "none"}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Planned</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {planned.length}
                  </div>
                  <div className="stat-sub">
                    may be described as planned, never as deliverable
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Waiting on a business decision</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {ceoBlocked.length}
                  </div>
                  <div className="stat-sub">
                    an account, a number, a provider — not engineering time
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Waiting on engineering</div>
                  <div className="stat-value" style={{ fontSize: 26 }}>
                    {engBlocked.length}
                  </div>
                  <div className="stat-sub">
                    {deferred.length} deferred and not being built
                  </div>
                </div>
              </div>

              <Card title="Bundles">
                <div className="list">
                  {c.bundles.map((b) => {
                    const v = bundleStatus(b);
                    return (
                      <div className="li" key={b.key}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{b.name}</div>
                          <div className="muted" style={{ fontSize: 12.5 }}>
                            {b.description}
                          </div>
                          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                            {b.capabilities.join(", ")}
                          </div>
                          {v.kind === "blocked" && (
                            <div className="blk" style={{ fontSize: 12 }}>
                              {v.note}
                            </div>
                          )}
                        </div>
                        <span className={`badge ${v.kind === "ready" ? "ok" : "warn"}`}>
                          {b.shipped} of {b.total} shipped
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {[...byCategory.entries()].map(([category, caps]) => (
                <Card key={category} title={category}>
                  <div className="list">
                    {caps.map((cp) => {
                      const blocker = capabilityBlocker(cp);
                      return (
                        <div className="cap" key={cp.key}>
                          <div>
                            <div className="row" style={{ gap: 8 }}>
                              <span className="nm">{cp.name}</span>
                              <span
                                className={`badge ${
                                  cp.status === "available"
                                    ? "ok"
                                    : cp.status === "deferred"
                                      ? "danger"
                                      : "warn"
                                }`}
                              >
                                {cp.status}
                              </span>
                              <span className="dim" style={{ fontSize: 11.5 }}>
                                v{cp.version}
                              </span>
                            </div>
                            <div className="ds">{cp.description}</div>
                            {blocker && <div className="blk">{blocker}</div>}
                            {cp.requires.length > 0 && (
                              <div className="req">
                                Needs first: {cp.requires.map((r) => r.key).join(", ")}{" "}
                                — {cp.requires[0]!.reason}
                              </div>
                            )}
                            {cp.locked_config_keys.length > 0 && (
                              <div className="req">
                                Locked at the schema, not configurable by anyone:{" "}
                                {cp.locked_config_keys.join(", ")}. Switching these on
                                is prevented by the database, not by policy.
                              </div>
                            )}
                          </div>
                          <div className="dim" style={{ fontSize: 11.5 }}>
                            {cp.key}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </>
          );
        }}
      </Loaded>
    </>
  );
}
