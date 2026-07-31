"use client";

import { useEffect } from "react";
import { browserSupabase } from "@/lib/browser";

export default function LogoutPage() {
  useEffect(() => {
    const supabase = browserSupabase();
    const done = () => window.location.assign("/login");
    if (!supabase) {
      done();
      return;
    }
    void supabase.auth.signOut().finally(done);
  }, []);

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ color: "#8b949e", fontSize: 13 }}>Signing out…</p>
    </main>
  );
}
