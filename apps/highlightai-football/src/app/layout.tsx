import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "HighlightAI Football",
  description: "Find your player. Find every play. Build the highlights automatically.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
