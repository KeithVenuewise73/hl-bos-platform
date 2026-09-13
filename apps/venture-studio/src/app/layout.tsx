import type { ReactNode } from "react";

/**
 * Every route is rendered per request.
 *
 * The security policy carries a per-request nonce (src/lib/csp.ts), and Next
 * can only stamp that onto its script tags while rendering the request. A
 * statically prerendered page's HTML is built long before any nonce exists, so
 * it would ship with a policy naming a nonce that none of its scripts carry --
 * every inline hydration script blocked, and the page dead on arrival.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Herman Legacy Venture Studio",
  description: "Executive opportunity intelligence — assembled on HL-BOS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0d1117",
          color: "#e6edf3",
        }}
      >
        {children}
      </body>
    </html>
  );
}
