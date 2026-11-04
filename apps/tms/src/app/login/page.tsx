import { USERS, demo } from "@/lib/demo.ts";
import { PageTitle } from "@/components/ui.tsx";
import { SignInButton } from "@/components/SignInButton.tsx";

export const dynamic = "force-dynamic";

export default async function Login() {
  const companies = (await demo()).companies;
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle
        title="Sign in (demo)"
        sub="Pick a synthetic person. There is no password because this is a local demo; production sign-in is HL-BOS accounts."
      />
      {[...companies.values()].map((c) => (
        <section key={c.id} className="mb-5 rounded-lg border border-line bg-panel p-4">
          <h2 className="font-semibold">{c.name}</h2>
          <p className="mb-3 text-xs text-muted">{c.profile}</p>
          <div className="grid gap-2">
            {USERS.filter((u) => u.company === c.id).map((u) => (
              <SignInButton key={u.id} user={u.id} email={u.email}>
                <span className="font-medium">{u.name}</span>{" "}
                <span className="text-sm text-muted">— {u.title}</span>
              </SignInButton>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
