import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/shell";
import { getViewer } from "@/lib/session";

export const metadata = {
  title: "Football FilmStudy AI",
  description:
    "Upload the film. Understand the game. Coach the next rep. AI-assisted football film analysis for coaches, athletes and teams.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();

  return (
    <html lang="en">
      <body>
        {viewer.authenticated ? (
          <Shell
            role={viewer.role}
            teamName={viewer.team?.name ?? null}
            isDemo={viewer.team?.is_demo ?? false}
          >
            {children}
          </Shell>
        ) : (
          <main className="main" style={{ maxWidth: 560, margin: "0 auto" }}>
            {children}
          </main>
        )}
      </body>
    </html>
  );
}
