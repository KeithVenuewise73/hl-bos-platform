import { connect } from "@/lib/supabase";
import {
  loadSite,
  missingBeforePublish,
  myShops,
  OWNED_WEBSITE,
  SHOP_PAGES_BASE,
} from "@/lib/barberos";
import { Badge, Card, Empty } from "@/components/ui";
import { SiteEditor } from "@/components/SiteEditor";

export const dynamic = "force-dynamic";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const state = await connect();
  if (!state.connected) {
    return (
      <Shell>
        <Card title="Not signed in">
          <Empty>
            {state.reason}{" "}
            <a href="/login" style={{ color: "#58a6ff" }}>
              Sign in
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  let shops, site;
  try {
    // The shop list is what says whether this person may edit or publish. It
    // comes from the database rather than being assumed here, and the editor
    // draws its controls from it.
    shops = await myShops(state.client);
    site = await loadSite(state.client, tenant);
  } catch (e) {
    return (
      <Shell email={state.email}>
        <Card title="Could not open this shop">
          <Empty>{(e as Error).message}</Empty>
        </Card>
      </Shell>
    );
  }

  const shop = shops.find((s) => s.tenantId === tenant);
  if (shop === undefined) {
    return (
      <Shell email={state.email}>
        <Card title="Not your shop">
          <Empty>
            This account is not a member of that shop.{" "}
            <a href="/" style={{ color: "#58a6ff" }}>
              Back to your shops
            </a>
          </Empty>
        </Card>
      </Shell>
    );
  }

  if (!shop.capabilities.includes(OWNED_WEBSITE)) {
    return (
      <Shell email={state.email} shopName={shop.shopName}>
        <Card title="Your page is not switched on">
          <Empty>
            This shop does not have the website capability enabled, so there is no page
            to edit. Whoever set up your account can turn it on.
          </Empty>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell email={state.email} shopName={shop.shopName}>
      {site !== null && (
        <p style={{ margin: "0 0 18px" }}>
          <Badge status={site.status} />
        </p>
      )}
      <SiteEditor
        tenantId={tenant}
        site={site}
        can={shop.can}
        publicUrl={`${SHOP_PAGES_BASE}/${site?.slug ?? ""}`}
        missing={missingBeforePublish(site)}
      />
    </Shell>
  );
}

function Shell({
  email,
  shopName,
  children,
}: {
  email?: string | null;
  shopName?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 64px" }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}>
            <a href="/" style={{ color: "#58a6ff" }}>
              ← Your shops
            </a>
          </p>
          <h1 style={{ fontSize: 20, margin: 0 }}>{shopName ?? "BarberOS"}</h1>
        </div>
        {email !== undefined && email !== null && (
          <span style={{ fontSize: 12, color: "#6e7681" }}>{email}</span>
        )}
      </header>
      {children}
    </main>
  );
}
