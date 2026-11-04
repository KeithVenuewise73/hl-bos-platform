"use client";

import type { ReactNode } from "react";

export function SignInButton({
  user,
  email,
  children,
}: {
  user: string;
  email: string;
  children: ReactNode;
}) {
  return (
    <button
      data-user={email}
      className="w-full rounded border border-line px-3 py-2 text-left hover:bg-wash"
      onClick={() =>
        void fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user }),
        }).then((r) => {
          if (r.ok) window.location.assign("/");
        })
      }
    >
      {children}
    </button>
  );
}
