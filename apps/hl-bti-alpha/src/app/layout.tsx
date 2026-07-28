import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HL-BTI Alpha — Business Transformation",
  description:
    "HL-BTI Alpha — the Herman Legacy Business Transformation application. Local executive workspace over the HL-BTI backend.",
};

// Set the theme before paint to avoid a flash. Reads a saved choice or the OS.
const themeScript = `(function(){try{var t=localStorage.getItem('hl-bti-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
