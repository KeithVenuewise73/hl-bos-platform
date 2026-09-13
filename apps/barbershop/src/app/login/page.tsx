import { LoginForm } from "@/components/LoginForm";

/**
 * FORCE-DYNAMIC, AND FOR A REASON THAT COST A DEPLOYMENT.
 *
 * The security policy in middleware.ts carries a per-request nonce, and Next
 * only stamps that nonce onto its own script tags while RENDERING the request.
 * A statically prerendered page's HTML is produced at build time, long before
 * any nonce exists -- so this page came back with a policy naming a nonce and
 * fifteen script tags carrying none of it. Every inline hydration script was
 * blocked, React never hydrated, and the sign-in button did nothing at all.
 *
 * That is also why the form is a separate client component: route segment
 * configuration like this cannot be exported from a "use client" file, and the
 * first version of this page was one.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
