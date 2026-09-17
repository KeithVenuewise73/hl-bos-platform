"use client";

import { useState } from "react";

import { myAgencies, type Agency } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { supabaseConfigured } from "@/lib/supabase";
import Shell, { type NavItem } from "@/components/Shell";
import { EmptyState } from "@/components/ui";
import AuditRun from "@/screens/AuditRun";
import Campaigns from "@/screens/Campaigns";
import CatalogScreen from "@/screens/Catalog";
import Clients from "@/screens/Clients";
import Crm from "@/screens/Crm";
import Delivery from "@/screens/Delivery";
import Intake from "@/screens/Intake";
import Onboard from "@/screens/Onboard";
import Pipeline from "@/screens/Pipeline";
import ProposalBuilder from "@/screens/ProposalBuilder";
import Prospect from "@/screens/Prospect";
import Reporting from "@/screens/Reporting";
import SignIn from "@/screens/SignIn";

// Client-side routing, because this is a statically exported SPA with no
// server. The view is a discriminated union rather than a string plus a bag of
// optional ids, so a screen cannot be rendered without the identifier it needs.
type View =
  | { k: "pipeline" }
  | { k: "intake" }
  | { k: "campaigns" }
  | { k: "prospect"; prospect: string }
  | { k: "run"; prospect: string | null; run: string }
  | { k: "proposal"; prospect: string; id: string | null; run: string | null }
  | { k: "onboard"; prospect: string }
  | { k: "clients" }
  | { k: "delivery"; tenant: string }
  | { k: "crm"; tenant: string }
  | { k: "catalog" }
  | { k: "reporting" };

const NAV: NavItem[] = [
  { key: "pipeline", label: "Pipeline", icon: "▦", group: "Sell" },
  { key: "campaigns", label: "Campaigns", icon: "◎", group: "Sell" },
  { key: "clients", label: "Client shops", icon: "✂", group: "Deliver" },
  { key: "catalog", label: "Capability catalog", icon: "▤", group: "Reference" },
  { key: "reporting", label: "Reporting", icon: "▩", group: "Reference" },
];

export default function Page() {
  const { loading, session, email } = useAuth();
  const agencies = useAsync(() => myAgencies(), [session?.user.id ?? ""]);
  const [tenant, setTenant] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: "pipeline" });

  if (!supabaseConfigured) {
    return (
      <div className="signin-shell">
        <div className="signin-card">
          <div className="banner bdanger">
            This build has no Supabase configuration. Set{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> at build time and rebuild
            — without them there is nothing for this console to read, and it will not
            pretend otherwise.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="signin-shell">
        <div className="signin-card">
          <div className="dim">Loading…</div>
        </div>
      </div>
    );
  }

  if (!session) return <SignIn />;

  const list = agencies.data ?? [];
  const agency: Agency | null =
    list.find((a) => a.tenant_id === tenant) ?? list[0] ?? null;

  function nav(key: string) {
    if (key === "pipeline") setView({ k: "pipeline" });
    else if (key === "campaigns") setView({ k: "campaigns" });
    else if (key === "clients") setView({ k: "clients" });
    else if (key === "catalog") setView({ k: "catalog" });
    else if (key === "reporting") setView({ k: "reporting" });
  }

  // Which nav item is highlighted for a screen reached from another screen.
  const activeKey =
    view.k === "prospect" ||
    view.k === "run" ||
    view.k === "proposal" ||
    view.k === "onboard"
      ? "pipeline"
      : view.k === "delivery" || view.k === "crm"
        ? "clients"
        : view.k === "intake"
          ? "pipeline"
          : view.k;

  return (
    <Shell
      email={email}
      agencies={list}
      agency={agency}
      onAgency={(t) => {
        setTenant(t);
        setView({ k: "pipeline" });
      }}
      nav={NAV}
      active={activeKey}
      onNavigate={nav}
    >
      {agencies.loading ? (
        <div className="dim">Loading your agencies…</div>
      ) : agencies.error ? (
        <div className="banner bdanger">{agencies.error}</div>
      ) : agency === null ? (
        <EmptyState title="Your account is not a member of any agency">
          This console reads audits, prospects and proposals for an agency tenant, and
          yours has no membership carrying transform_audit.audit.read. Nothing is shown
          rather than an empty pipeline that would look like a real one. Ask for a
          membership on the agency tenant you are meant to operate.
        </EmptyState>
      ) : (
        renderView()
      )}
    </Shell>
  );

  function renderView() {
    if (!agency) return null;
    switch (view.k) {
      case "pipeline":
        return (
          <Pipeline
            agency={agency}
            onOpen={(prospect) => setView({ k: "prospect", prospect })}
            onIntake={() => setView({ k: "intake" })}
          />
        );
      case "intake":
        return (
          <Intake
            agency={agency}
            onBack={() => setView({ k: "pipeline" })}
            onSaved={(prospect) => setView({ k: "prospect", prospect })}
          />
        );
      case "campaigns":
        return <Campaigns agency={agency} />;
      case "prospect":
        return (
          <Prospect
            agency={agency}
            prospectId={view.prospect}
            onBack={() => setView({ k: "pipeline" })}
            onOpenRun={(run) => setView({ k: "run", prospect: view.prospect, run })}
            onNewProposal={(run) =>
              setView({ k: "proposal", prospect: view.prospect, id: null, run })
            }
            onOpenProposal={(id) =>
              setView({ k: "proposal", prospect: view.prospect, id, run: null })
            }
            onOnboard={() => setView({ k: "onboard", prospect: view.prospect })}
            onOpenShop={(tenantId) => setView({ k: "delivery", tenant: tenantId })}
          />
        );
      case "run":
        return (
          <AuditRun
            agency={agency}
            runId={view.run}
            onBack={() =>
              view.prospect
                ? setView({ k: "prospect", prospect: view.prospect })
                : setView({ k: "pipeline" })
            }
            onDraftProposal={(run) =>
              view.prospect
                ? setView({ k: "proposal", prospect: view.prospect, id: null, run })
                : setView({ k: "pipeline" })
            }
          />
        );
      case "proposal":
        return (
          <ProposalBuilder
            agency={agency}
            prospectId={view.prospect}
            proposalId={view.id}
            runId={view.run}
            onBack={() => setView({ k: "prospect", prospect: view.prospect })}
            onOnboard={() => setView({ k: "onboard", prospect: view.prospect })}
          />
        );
      case "onboard":
        return (
          <Onboard
            agency={agency}
            prospectId={view.prospect}
            onBack={() => setView({ k: "prospect", prospect: view.prospect })}
            onDone={(t) => setView({ k: "delivery", tenant: t })}
          />
        );
      case "clients":
        return (
          <Clients
            onOpen={(t) => setView({ k: "delivery", tenant: t })}
            onOpenCrm={(t) => setView({ k: "crm", tenant: t })}
          />
        );
      case "delivery":
        return (
          <Delivery
            tenantId={view.tenant}
            onBack={() => setView({ k: "clients" })}
            onOpenCrm={() => setView({ k: "crm", tenant: view.tenant })}
          />
        );
      case "crm":
        return <Crm tenantId={view.tenant} onBack={() => setView({ k: "clients" })} />;
      case "catalog":
        return <CatalogScreen />;
      case "reporting":
        return <Reporting agency={agency} />;
    }
  }
}
