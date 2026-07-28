import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Herman Legacy — Business Transformation Intelligence",
  description:
    "The Herman Legacy Business Transformation platform. Sign in, analyze a business, and generate an executive blueprint and proposal — saved to the Herman Legacy cloud.",
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
