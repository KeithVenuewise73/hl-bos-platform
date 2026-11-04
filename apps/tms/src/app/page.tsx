import Link from "next/link";
import { redirect } from "next/navigation";
import { moduleByKey } from "@hl-bos/tms";
import { currentCtx } from "@/lib/guard.ts";
import { Card, PageTitle } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ctx = await currentCtx();
  if (!ctx) redirect("/login");
  return (
    <div>
      <PageTitle
        title={`Welcome, ${ctx.user.name}`}
        sub={`${ctx.company.name} · ${ctx.user.title}`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="What you can open">
          <ul className="space-y-2">
            {ctx.nav
              .filter((s) => s.key !== "home")
              .map((s) => (
                <li key={s.key}>
                  <Link href={s.path} className="text-brand underline">
                    {s.label}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
        <Card title="Your company's modules">
          <ul data-testid="active-modules" className="space-y-1 text-sm">
            {ctx.activeModules.map((k) => (
              <li key={k}>
                ✓ {moduleByKey(k as Parameters<typeof moduleByKey>[0]).name}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
