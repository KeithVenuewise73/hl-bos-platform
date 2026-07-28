"use client";

import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";
import SignIn from "@/screens/SignIn";
import Workspace from "@/screens/Workspace";

export default function Page() {
  const { loading, session, email } = useAuth();

  if (!supabaseConfigured) {
    return (
      <div className="signin-shell">
        <div className="signin-card">
          <div className="banner bdanger">
            This build is missing its Supabase configuration (
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>). Set them at build time
            in the Coolify deployment and rebuild.
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="signin-shell">
        <div className="signin-card">
          <div className="dim">Loading…</div>
        </div>
      </div>
    );
  }

  if (!session) return <SignIn />;
  return <Workspace email={email} />;
}
