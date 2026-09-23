import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "DispatchOS Match",
  description:
    "Backhaul load matching ranked by projected contribution and revenue per mile, with every rejection explained.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
