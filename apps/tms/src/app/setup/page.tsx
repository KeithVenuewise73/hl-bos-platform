import { text, type TeamMember } from "@hl-bos/tms";
import { demo, USERS } from "@/lib/demo.ts";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { PageTitle } from "@/components/ui.tsx";
import { SetupForms } from "@/components/SetupForms.tsx";

export const dynamic = "force-dynamic";

/**
 * Core setup every licensed company gets: the shared vehicle registry and
 * who may sign in. This is how a DVIR-only customer registers trucks and
 * assigns drivers without buying Fleet Management.
 */
export default async function Setup() {
  const ctx = await requireScreen("setup");
  const s = await snapshotFor(ctx);
  const team = await (
    await demo()
  ).backend.call<{ members: TeamMember[] }>(ctx.user.id, "team", {
    workspace: ctx.company.id,
  });
  const names = new Map(USERS.map((u) => [u.email, u.name]));
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
          name: names.get(m.email) ?? m.email,
        }))}
        isOwner={ctx.user.role === "owner"}
      />
    </div>
  );
}
