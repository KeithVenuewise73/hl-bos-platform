import type { ReactNode } from "react";

import { Nav } from "@/components/Nav.tsx";
import "./globals.css";

export const metadata = {
  title: "5-Star Hype Video · 5-Star Sports Media",
  description:
    "Turn a photo or clip and a few details into a personalized sports hype package: scripts, voiceover, captions, hashtags and ready-to-use video and music prompts.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08090b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="main">{children}</main>
        <footer className="footer">
          5-Star Hype Video · 5-Star Sports Media · a Herman Legacy Group product ·
          Projects are private and stored on this computer.
        </footer>
      </body>
    </html>
  );
}
