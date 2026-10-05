import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@/actions/auth.ts";
import { Brand } from "@/components/Brand.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { currentUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if ((await currentUser()) !== null) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm px-4">
      <Brand large />
      <p className="mt-2 text-muted">
        AI-powered sports photo organization by player, jersey number, event, and date.
      </p>
      <form action={signUpAction} className="card mt-6 space-y-4 p-5">
        <h1 className="display text-xl">Create your account</h1>
        <Notice error={param(sp, "error")} />
        <div>
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input className="input" id="name" name="name" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="organization">
            Team, school or studio
          </label>
          <input
            className="input"
            id="organization"
            name="organization"
            placeholder="West Seneca Football"
            required
          />
          <p className="mt-1 text-xs text-muted">
            Everything you upload belongs to this organization and is visible only to
            its members.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password (10+ characters)
          </label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <button className="btn-primary w-full" type="submit">
          Create account
        </button>
        <p className="text-sm text-muted">
          Have an account?{" "}
          <Link className="text-brand-2 underline" href="/login">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
