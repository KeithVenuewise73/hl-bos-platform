import type { ReactNode } from "react";
import { Nav } from "@/components/Nav.tsx";
import { getViewer } from "@/lib/session.ts";
import "./globals.css";

export const metadata = {
  title: "ATS Resume Optimizer",
  description:
    "Compare a job posting against your resume, see every requirement matched against real evidence, and generate a tailored resume where every sentence is traceable to a fact.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav signedInAs={viewer.email} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
