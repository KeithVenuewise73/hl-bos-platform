"use client";
import { useEffect } from "react";
import { browserSupabase } from "@/lib/browser";

export default function Logout() {
  useEffect(() => {
    const sb = browserSupabase();
    const done = () => (window.location.href = "/login");
    if (sb) void sb.auth.signOut().then(done);
    else done();
  }, []);
  return <main style={{ padding: 40 }}>Signing out…</main>;
}
