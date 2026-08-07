import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { BRAND } from "@/lib/content";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.short} — ${BRAND.descriptor}`,
    template: `%s — ${BRAND.short}`,
  },
  description:
    "Herman Supply Chain Solutions (HSCS) is a transportation & operations consulting firm built by a business owner and designed for operators — 35 years of operational experience, enhanced by AI.",
};

// Nonce-based CSP (see middleware.ts) is incompatible with static prerendering:
// a statically baked page cannot carry the per-request nonce Next.js needs on
// its framework scripts, so hydration of the responsive nav would be blocked.
// Forcing dynamic rendering makes Next apply the middleware nonce per request.
// This mirrors the established Herman Legacy Digital pattern.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
