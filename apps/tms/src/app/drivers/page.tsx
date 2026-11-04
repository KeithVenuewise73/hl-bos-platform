import Link from "next/link";
import { text, type TeamMember } from "@hl-bos/tms";
import { demo } from "@/lib/demo.ts";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { Card, Empty, Expiry, PageTitle } from "@/components/ui.tsx";
import { DriverProfileForm } from "@/components/DriverProfileForm.tsx";

export const dynamic = "force-dynamic";

export default async function Drivers() {
  const ctx = await requireScreen("drivers");
  const s = await snapshotFor(ctx);
  const team = await (
    await demo()
  ).backend.call<{ members: TeamMember[] }>(ctx.user.id, "team", {
    workspace: ctx.company.id,
  });
  const drivers = s.state.payload?.drivers ?? [];
  return (
    <div className="space-y-4">
      <PageTitle
        title="Drivers"
        sub="Driver Management · profiles, credentials and expiry tracking. Medical-card upload exists in the production backend but is not wired here."
      />
      <Card>
        {drivers.length === 0 ? (
          <Empty>No driver profiles yet.</Empty>
        ) : (
          <table data-testid="drivers" className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">Driver</th>
                <th>Licence</th>
                <th>CDL expires</th>
                <th>Medical expires</th>
                <th className="hidden md:table-cell">Vehicles</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const m = team.members.find((x) => x.email === d.email);
                return (
                  <tr
                    key={text(d.id)}
                    data-driver={text(d.id)}
                    className="border-t border-line"
                  >
                    <td className="py-2">
                      <Link
                        className="text-brand underline"
                        href={`/drivers/${text(d.id)}`}
                      >
                        {text(d.name)}
                      </Link>
                    </td>
                    <td>
                      {text(d.licenseClass, "")}{" "}
                      {d.endorsements ? (
                        <span className="text-muted">({text(d.endorsements)})</span>
                      ) : null}
                    </td>
                    <td>
                      <Expiry date={d.cdlExpires} />
                    </td>
                    <td>
                      <Expiry date={d.medicalExpires} />
                    </td>
                    <td className="hidden md:table-cell">
                      {m?.units.join(", ") || (
                        <span className="text-muted">
                          {m ? "none" : "no sign-in account"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Add a driver profile">
        <DriverProfileForm />
      </Card>
    </div>
  );
}
