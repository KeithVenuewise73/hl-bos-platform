import Link from "next/link";
import { SCREENS, moduleByKey } from "@hl-bos/tms";
import { PageTitle } from "@/components/ui.tsx";

export default async function Locked({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; reason?: string }>;
}) {
  const { screen, reason } = await searchParams;
  const s = SCREENS.find((x) => x.key === screen);
  const mods =
    s && s.modules !== "core"
      ? s.modules.map((m) => moduleByKey(m).name).join(" or ")
      : null;
  return (
    <div
      data-testid="locked"
      data-reason={reason}
      className="mx-auto max-w-lg rounded-lg border border-line bg-panel p-6"
    >
      <PageTitle title="Not available" />
      {reason === "not_licensed" ? (
        <p>
          <b>{s?.label ?? "This screen"}</b> is part of <b>{mods}</b>, which your
          company has not licensed.
        </p>
      ) : reason === "role_not_allowed" ? (
        <p>
          <b>{s?.label ?? "This screen"}</b> is not available to your role.
        </p>
      ) : (
        <p>Your company has no active TMS module.</p>
      )}
      <p className="mt-4">
        <Link className="text-brand underline" href="/">
          Back to home
        </Link>
      </p>
    </div>
  );
}
