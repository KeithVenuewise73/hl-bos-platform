import type { ReactNode } from "react";

import { Nav } from "@/components/Nav.tsx";
import { db } from "@/lib/db.ts";
import { kickQueue } from "@/lib/queue.ts";
import { progress } from "@/lib/repo/dashboard.ts";
import { currentUser } from "@/lib/session.ts";
import "./globals.css";

export const metadata = {
  title: "JerseySort AI · Find your athlete. Instantly.",
  description:
    "Turn hundreds of game photos into organized player galleries in minutes.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0c10",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  let nav: ReactNode = null;
  if (user !== null) {
    const p = progress(db(), user.organizationId, null);
    // Anything waiting (for example after a restart) starts moving as soon as
    // someone opens the app.
    if (p.queued + p.processing > 0) kickQueue();
    nav = (
      <Nav
        user={user}
        reviewCount={p.needsReview}
        processing={p.queued + p.processing}
      />
    );
  }
  return (
    <html lang="en">
      <body className="min-h-screen">
        {nav}
        <main className="mx-auto max-w-7xl px-4 pb-24 pt-5">{children}</main>
      </body>
    </html>
  );
}
