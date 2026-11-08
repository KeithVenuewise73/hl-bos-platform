import type { ReactNode } from "react";

export const metadata = {
  title: "Herman Legacy Digital — websites, marketing and practical technology",
  description:
    "Herman Legacy Digital helps businesses improve their online presence, attract customers and operate more efficiently through websites, marketing and practical technology.",
};

// Nonce-based CSP (see middleware.ts) is incompatible with static prerendering:
// a statically baked page cannot carry the per-request nonce Next.js needs on
// its framework scripts, so hydration would be blocked. Forcing dynamic
// rendering makes every route render per request, which is when Next applies
// the middleware nonce to its scripts.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
      </body>
    </html>
  );
}
