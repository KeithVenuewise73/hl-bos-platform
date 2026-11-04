import type { ReactNode } from "react";
import Link from "next/link";
import { currentCtx } from "@/lib/guard.ts";
import { SignOut } from "@/components/SignOut.tsx";
import "./globals.css";

export const metadata = { title: "HSCS TransportationOS · isolated environment" };
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b4f6c",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const ctx = await currentCtx();
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div
          data-testid="demo-banner"
          className="no-print bg-accent px-4 py-1 text-center text-xs font-semibold text-ink"
        >
          ISOLATED DEVELOPMENT ENVIRONMENT · synthetic data · saved in a local database
          on this computer · not connected to production
        </div>
        <header className="no-print bg-brand text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="font-bold tracking-tight">
              TransportationOS
            </Link>
            {ctx ? (
              <>
                <nav data-testid="nav" className="flex flex-wrap gap-1 text-sm">
                  {ctx.nav
                    .filter((s) => s.key !== "home")
                    .map((s) => (
                      <Link
                        key={s.key}
                        href={s.path}
                        data-nav={s.key}
                        className="rounded px-2 py-1 hover:bg-white/15"
                      >
                        {s.label}
                      </Link>
                    ))}
                </nav>
                <div className="ml-auto text-right text-xs leading-tight">
                  <div className="font-semibold">{ctx.user.name}</div>
                  <div className="opacity-80">
                    {ctx.company.name} · {ctx.role} <SignOut />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
