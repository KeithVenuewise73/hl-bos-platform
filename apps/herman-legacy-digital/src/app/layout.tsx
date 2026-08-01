import type { ReactNode } from "react";

export const metadata = {
  title: "Herman Legacy Digital — AI-powered business transformation",
  description:
    "Herman Legacy Digital helps organizations improve visibility, operations, customer acquisition, and growth through AI-powered business transformation.",
};

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
