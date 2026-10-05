import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/actions/auth.ts";
import { Brand } from "@/components/Brand.tsx";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { currentUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if ((await currentUser()) !== null) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm px-4">
      <Brand large />
      <p className="mt-2 text-muted">Find your athlete. Instantly.</p>
      <form action={signInAction} className="card mt-6 space-y-4 p-5">
        <h1 className="display text-xl">Sign in</h1>
        <Notice error={param(sp, "error")} />
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
            Password
          </label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button className="btn-primary w-full" type="submit">
          Sign in
        </button>
        <p className="text-sm text-muted">
          New here?{" "}
          <Link className="text-brand-2 underline" href="/signup">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
