import Link from "next/link";
import { unitStatuses, text } from "@hl-bos/tms";
import { requireScreen, snapshotFor } from "@/lib/guard.ts";
import { Card, Empty, Expiry, PageTitle, StatusPill } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

export default async function Fleet() {
  const ctx = await requireScreen("fleet");
  const s = await snapshotFor(ctx);
  const live = new Map(unitStatuses(s).map((u) => [u.id, u]));
  const assets = s.state.payload?.assets ?? [];
  return (
    <div>
      <PageTitle
        title="Vehicles"
        sub="Fleet Management · profiles, registration and operating history. Add vehicles under Company setup."
      />
      <Card>
        {assets.length === 0 ? (
          <Empty>No vehicles yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1">Unit</th>
                <th>Type</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Registration</th>
                <th className="hidden md:table-cell">Open defects</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const id = text(a.id);
                const u = live.get(id);
                return (
                  <tr key={id} className="border-t border-line">
                    <td className="py-2">
                      <Link className="text-brand underline" href={`/fleet/${id}`}>
                        {id}
                      </Link>{" "}
                      <span className="text-muted">{text(a.name, "")}</span>
                    </td>
                    <td>{text(a.type, "")}</td>
                    <td>{u ? <StatusPill status={u.status} /> : null}</td>
                    <td className="hidden md:table-cell">
                      <Expiry date={a.registrationExpires} />
                    </td>
                    <td className="hidden md:table-cell">{u?.openDefects ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
