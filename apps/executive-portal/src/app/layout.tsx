import type { ReactNode } from "react";

export const metadata = {
  title: "Herman Legacy Executive Portal",
  description:
    "Read-only executive view of the Enterprise Catalog and Software Factory.",
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
