import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * The Intelligence Center is an internal, authenticated workspace. It must never
 * be indexed or previewed by crawlers, even if a route were ever reachable
 * unauthenticated. Defense in depth alongside the middleware auth gate.
 */
export const metadata: Metadata = {
  title: "Intelligence Center — Herman Legacy Digital (Internal)",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function IntelligenceLayout({ children }: { children: ReactNode }) {
  return children;
}
