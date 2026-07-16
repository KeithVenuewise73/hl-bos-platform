import type { ReactNode } from "react";

export const metadata = {
  title: "HL-BOS — Development Control Center",
  description: "Run Herman Legacy Software Ventures without a terminal.",
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
