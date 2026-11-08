import {
  CAPABILITIES,
  MODULES,
  isAvailableInThisBuild,
  moduleByKey,
  resolveEntitlements,
} from "@hl-bos/tms";
import { requireScreen } from "@/lib/guard.ts";
import { Card, PageTitle } from "@/components/ui.tsx";
import { ModuleToggles } from "@/components/ModuleToggles.tsx";

export const dynamic = "force-dynamic";

/** Workflow D's control panel: what this company licenses, and what that brings with it. */
export default async function Modules() {
  const ctx = await requireScreen("modules");
  const r = resolveEntitlements(ctx.company.licensed);
  return (
    <div className="space-y-4">
      <PageTitle
        title="Modules"
        sub="Demonstration of module licensing. In production, licences come from billing, not from this page."
      />
      <ModuleToggles
        licensed={ctx.company.licensed}
        modules={MODULES.map((m) => ({
          key: m.key,
          number: m.number,
          name: m.name,
          release: m.release,
          summary: m.summary,
          available: isAvailableInThisBuild(m.key),
          backend: m.backend,
          ui: m.ui,
          needs: m.requiresAnyOf.map((d) => moduleByKey(d).name),
        }))}
      />
      <Card title="Included platform capabilities (not billed)">
        <ul data-testid="capabilities" className="grid gap-1 text-sm md:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <li
              key={c.key}
              data-cap={c.key}
              data-on={r.capabilities.includes(c.key)}
              className={
                r.capabilities.includes(c.key) ? "" : "text-muted line-through"
              }
            >
              {r.capabilities.includes(c.key) ? "✓" : "–"} {c.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
