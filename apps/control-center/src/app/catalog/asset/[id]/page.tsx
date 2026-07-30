import { notFound } from "next/navigation";
import { catalogView, neighborhood, KIND_LABEL } from "@/lib/catalog";
import { Card, Row } from "@/components/ui";
import { ReusePill, MaturityBadge } from "@/components/CatalogUI";
import type { Asset, RelationKind } from "@hl-bos/catalog";

export const dynamic = "force-dynamic";

const RELATION_LABEL: Record<RelationKind, string> = {
  uses: "Uses",
  depends_on: "Depends on",
  provides: "Provides",
  consumes: "Consumes",
  extends: "Extends",
  owned_by: "Owned by",
  referenced_by: "Referenced by",
  replaced_by: "Replaced by",
  successor: "Successor",
  deprecated: "Deprecates",
};

function AssetLink({
  id,
  name,
  note,
}: {
  id: string;
  name: string;
  note?: string | undefined;
}) {
  return (
    <a
      href={`/catalog/asset/${encodeURIComponent(id)}`}
      style={{ color: "#58a6ff", fontSize: 13, textDecoration: "none" }}
    >
      {name}
      {note ? <span style={{ color: "#6e7681" }}> — {note}</span> : null}
    </a>
  );
}

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const assetId = decodeURIComponent(id);
  const { catalog } = await catalogView();
  const asset: Asset | undefined = catalog.assets.find((a) => a.id === assetId);
  if (!asset) notFound();

  const n = neighborhood(catalog, asset.id);
  const byId = (aid: string) => catalog.assets.find((a) => a.id === aid);

  // Group outgoing edges by relation kind.
  const outByKind = new Map<
    RelationKind,
    { id: string; name: string; note?: string }[]
  >();
  for (const r of n.outgoing) {
    const target = byId(r.to);
    if (!target) continue;
    const arr = outByKind.get(r.kind) ?? [];
    arr.push(
      r.note
        ? { id: target.id, name: target.name, note: r.note }
        : { id: target.id, name: target.name },
    );
    outByKind.set(r.kind, arr);
  }
  // Group incoming edges by their inverse label.
  const inByLabel = new Map<string, { id: string; name: string }[]>();
  for (const e of n.incoming) {
    const src = byId(e.from);
    if (!src) continue;
    const arr = inByLabel.get(e.inverseLabel) ?? [];
    arr.push({ id: src.id, name: src.name });
    inByLabel.set(e.inverseLabel, arr);
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "#6e7681" }}>
          <a href="/catalog" style={{ color: "#58a6ff" }}>
            Enterprise Catalog
          </a>{" "}
          ·{" "}
          <a href={`/catalog/${asset.kind}`} style={{ color: "#58a6ff" }}>
            {KIND_LABEL[asset.kind].many}
          </a>
        </div>
        <h1 style={{ margin: "6px 0 0", fontSize: 22 }}>{asset.name}</h1>
        <p
          style={{
            margin: "6px 0 0",
            color: "#c9d1d9",
            fontSize: 13.5,
            lineHeight: 1.6,
          }}
        >
          {asset.summary}
        </p>
      </header>

      <Card title="At a glance">
        <Row k="Kind" v={KIND_LABEL[asset.kind].one} />
        <Row k="Layer" v={asset.layer} />
        <Row k="Owner" v={asset.owner} />
        <Row k="Maturity" v={<MaturityBadge maturity={asset.maturity} />} />
        {asset.location ? <Row k="Location" v={asset.location} mono /> : null}
        {asset.metrics
          ? Object.entries(asset.metrics).map(([k, v]) => (
              <Row key={k} k={k.replace(/_/g, " ")} v={String(v)} />
            ))
          : null}
        <div style={{ marginTop: 12 }}>
          {asset.reuse.map((f) => (
            <ReusePill key={f} flag={f} />
          ))}
        </div>
        {asset.evidence ? (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 11.5,
              color: "#6e7681",
              lineHeight: 1.6,
            }}
          >
            Evidence: {asset.evidence}
          </p>
        ) : null}
      </Card>

      <Card
        title="Relationships"
        sub="How this asset connects to the rest of the estate — its dependencies and dependents."
      >
        {outByKind.size === 0 && inByLabel.size === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
            No relationships recorded yet.
          </p>
        ) : (
          <>
            {[...outByKind.entries()].map(([kind, targets]) => (
              <div
                key={kind}
                style={{ padding: "8px 0", borderBottom: "1px solid #1c2128" }}
              >
                <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
                  {RELATION_LABEL[kind]}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                  {targets.map((t) => (
                    <AssetLink key={t.id} id={t.id} name={t.name} note={t.note} />
                  ))}
                </div>
              </div>
            ))}
            {[...inByLabel.entries()].map(([label, sources]) => (
              <div
                key={label}
                style={{ padding: "8px 0", borderBottom: "1px solid #1c2128" }}
              >
                <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
                  {label[0]!.toUpperCase() + label.slice(1)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                  {sources.map((s) => (
                    <AssetLink key={s.id} id={s.id} name={s.name} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      {asset.tags && asset.tags.length > 0 ? (
        <p style={{ fontSize: 11.5, color: "#6e7681", marginTop: 6 }}>
          Tags: {asset.tags.join(" · ")}
        </p>
      ) : null}
    </main>
  );
}
