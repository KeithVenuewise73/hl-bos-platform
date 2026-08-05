import type { ReactNode } from "react";

export const metadata = {
  title: "Herman Legacy Digital — AI-powered business transformation",
  description:
    "Herman Legacy Digital helps organizations improve visibility, operations, customer acquisition, and growth through AI-powered business transformation.",
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
