import type { ReactNode } from "react";

// Just the name. A description of what this app holds would be served to
// anyone on the network who opened it, before they had typed anything.
export const metadata = {
  title: "SceneFlow",
};

// Phones. Without this the page renders at desktop width and is unreadable.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0b0d10",
          color: "#e8eaed",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
