import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "DateSort · Photos by the day they were taken",
  description:
    "Scan a folder of loose camera photos and see them grouped by shooting date. Read only.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d11",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
