import { notFound } from "next/navigation";
import { catalogView, assetsByKind, KIND_LABEL } from "@/lib/catalog";
import { AssetRow } from "@/components/CatalogUI";
import type { AssetKind } from "@hl-bos/catalog";

export const dynamic = "force-dynamic";

const KINDS = new Set<AssetKind>([
  "product",
  "application",
  "module",
  "package",
  "shared_service",
  "ai_capability",
  "api",
  "repository",
  "database",
  "workflow",
  "edge_function",
  "industry_solution",
  "business_capability",
]);

export default async function KindPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!KINDS.has(kind as AssetKind)) notFound();
  const typedKind = kind as AssetKind;

  const { catalog } = await catalogView();
  const assets = assetsByKind(catalog, typedKind);
  const label = KIND_LABEL[typedKind];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 21 }}>{label.many}</h1>
        <p style={{ margin: "4px 0 0", color: "#8b949e", fontSize: 13 }}>
          {assets.length}{" "}
          {assets.length === 1 ? label.one.toLowerCase() : label.many.toLowerCase()} in
          the catalog.{" "}
          <a href="/catalog" style={{ color: "#58a6ff" }}>
            ← Enterprise Catalog
          </a>
        </p>
      </header>

      <div
        style={{
          background: "#12151a",
          border: "1px solid #262c36",
          borderRadius: 12,
          padding: "6px 18px 14px",
        }}
      >
        {assets.map((a) => (
          <AssetRow key={a.id} asset={a} />
        ))}
      </div>
    </main>
  );
}
