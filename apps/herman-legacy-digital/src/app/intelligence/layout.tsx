import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getInternalViewer } from "@/lib/session";
import { BticAccessNotice } from "@/components/btic-access";

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

export default async function IntelligenceLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Primary role gate for the whole section (defense-in-depth with the
  // middleware edge check and each page's own server-side re-check). Anonymous
  // and client-only viewers never see any BTIC content.
  const viewer = await getInternalViewer();
  if (!viewer.canBTIC) return <BticAccessNotice viewer={viewer} />;
  return children;
}
