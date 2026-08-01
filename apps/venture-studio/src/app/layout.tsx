import type { ReactNode } from "react";

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
