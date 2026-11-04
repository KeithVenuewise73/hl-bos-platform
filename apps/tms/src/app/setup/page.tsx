import { text, type TeamMember } from "@hl-bos/tms";
import { fleetCall, requireScreen, snapshotFor } from "@/lib/guard.ts";
import { PageTitle } from "@/components/ui.tsx";
import { SetupForms } from "@/components/SetupForms.tsx";
import { TemplateEditor } from "@/components/TemplateEditor.tsx";

export const dynamic = "force-dynamic";

/**
 * Core setup every licensed company gets: the shared vehicle registry and
 * who may sign in. This is how a DVIR-only customer registers trucks and
 * assigns drivers without buying Fleet Management.
 */
export default async function Setup() {
  const ctx = await requireScreen("setup");
  const s = await snapshotFor(ctx);
  const team = await fleetCall<{ members: TeamMember[] }>(ctx, "team");
  const dvir = ctx.activeModules.includes("dvir");
  const templates = dvir
    ? await fleetCall<{ equipmentType: string; items: string[] }[]>(ctx, "templates")
    : [];
  const types = [
    ...new Set(
      (s.state.payload?.assets ?? []).map((a) => text(a.type)).filter(Boolean),
    ),
  ].sort();
  return (
    <div>
      <PageTitle
        title="Company setup"
        sub={`${ctx.company.name} · vehicle registry and people. Included with every module.`}
      />
      <SetupForms
        units={(s.state.payload?.assets ?? []).map((a) => ({
          id: text(a.id),
          name: text(a.name, ""),
          type: text(a.type, ""),
          tankConfig: text(a.tankConfig, ""),
        }))}
        members={team.members.map((m) => ({
          ...m,
          name: m.email.split("@")[0]!.replace(/^./, (c) => c.toUpperCase()),
        }))}
        isOwner={ctx.role === "owner"}
      />
      {dvir ? (
        <div className="mt-4 grid md:grid-cols-2">
          <TemplateEditor templates={templates} types={types} />
        </div>
      ) : null}
    </div>
  );
}
