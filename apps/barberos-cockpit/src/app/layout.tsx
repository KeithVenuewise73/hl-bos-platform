import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Herman Legacy — Barbershop Transformation Cockpit",
  description:
    "Internal operator console for the BarberOS managed service: prospect, audit, discovery, proposal, sale, onboarding, delivery, client records and retention.",
};

const themeScript = `(function(){try{var t=localStorage.getItem('hlbos-cockpit-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

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
