import type { ReactNode } from "react";

import { Nav } from "@/components/Nav.tsx";
import { getViewer } from "@/lib/session.ts";
import "./globals.css";

export const metadata = {
  title: "HighlightAI Hockey",
  description:
    "Upload a game, describe the player, and get a reviewed highlight reel. It shows you what it found and how sure it is, and nothing reaches a reel that you have not approved.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav signedInAs={viewer.email} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
