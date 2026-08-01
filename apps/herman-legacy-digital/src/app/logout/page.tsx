"use client";

import { useEffect } from "react";
import { browserSupabase } from "@/lib/browser";

export default function LogoutPage() {
  useEffect(() => {
    const supabase = browserSupabase();
    const done = () => window.location.assign("/");
    if (!supabase) {
      done();
      return;
    }
    void supabase.auth.signOut().then(done);
  }, []);

  return (
    <main style={{ maxWidth: 380, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ fontSize: 14, color: "#5b6672" }}>Signing you out…</p>
    </main>
  );
}
