import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Game Cut · Two cameras, one game",
  description:
    "Turn two whole-game camera recordings into one broadcast-style video, or cut highlights from a list of times.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c0d10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
