import Link from "next/link";
import { notFound } from "next/navigation";
import { text, type TeamMember } from "@hl-bos/tms";
import { fleetCall, requireScreen, snapshotFor } from "@/lib/guard.ts";
import { Card, Empty, Expiry, PageTitle, fmtTime } from "@/components/ui.tsx";
import { DriverProfileForm } from "@/components/DriverProfileForm.tsx";

export const dynamic = "force-dynamic";

export default async function Driver({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireScreen("driver_detail");
  const s = await snapshotFor(ctx);
  const d = s.state.payload?.drivers.find((x) => text(x.id) === id);
  if (!d) notFound();
  const team = await fleetCall<{ members: TeamMember[] }>(ctx, "team");
  const member = team.members.find((m) => m.email === d.email);
  const inspections = member
    ? s.inspections.filter((i) => i.actor === member.id).reverse()
    : [];
  return (
    <div className="space-y-4">
      <PageTitle
        title={text(d.name)}
        sub={`${text(d.licenseClass, "")} · hired ${text(d.hired, "not recorded")}`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Credentials">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">CDL</dt>
            <dd>
              <Expiry date={d.cdlExpires} />
            </dd>
            <dt className="text-muted">Medical card</dt>
            <dd>
              <Expiry date={d.medicalExpires} />
            </dd>
            <dt className="text-muted">Endorsements</dt>
            <dd>{text(d.endorsements) || "none"}</dd>
            <dt className="text-muted">Sign-in</dt>
            <dd>
              {member ? `${member.email} · ${member.role}` : "no HL-BOS account linked"}
            </dd>
            <dt className="text-muted">Vehicles</dt>
            <dd>{member?.units.join(", ") || "none"}</dd>
          </dl>
          <div className="mt-3">
            <DriverProfileForm existing={d} />
          </div>
        </Card>
        <Card title="Inspection activity">
          {inspections.length === 0 ? (
            <Empty>No inspections submitted.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {inspections.map((i) => (
                <li key={i.id}>
                  <Link className="text-brand underline" href={`/inspections/${i.id}`}>
                    {i.payload.asset} · {i.payload.phase} ·{" "}
                    {fmtTime(i.payload.inspectedAt)}
                  </Link>{" "}
                  — {i.payload.checks.filter((c) => c.result === "Defect").length}{" "}
                  defect(s)
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
