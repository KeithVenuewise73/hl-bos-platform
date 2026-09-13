/**
 * Every route is rendered per request.
 *
 * The security policy carries a per-request nonce (src/lib/csp.ts), and Next
 * can only stamp that onto its script tags while rendering the request. A
 * statically prerendered page's HTML is built long before any nonce exists, so
 * it would ship with a policy naming a nonce that none of its scripts carry --
 * every inline hydration script blocked, and the page dead on arrival. That
 * shipped once, on /login, and this is the setting that stops a NEW page doing
 * it again silently.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "BarberOS",
  description: "Run your shop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0d1117",
          color: "#e6edf3",
          font: "15px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
