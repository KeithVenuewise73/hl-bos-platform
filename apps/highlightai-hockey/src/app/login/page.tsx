import { Suspense } from "react";

import { LoginForm } from "@/components/LoginForm.tsx";

/**
 * Sign in.
 *
 * A server component so it can declare its route config, wrapping the client
 * form in the Suspense boundary that `useSearchParams` requires. Without the
 * boundary the production build fails at prerender — which is how this was
 * found, by building the image the way the container builds it rather than the
 * way the dev server does.
 */
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div style={{ maxWidth: 380, margin: "12vh auto" }}>Loading…</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
