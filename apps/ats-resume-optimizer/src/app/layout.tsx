import type { ReactNode } from "react";
import { Nav } from "@/components/Nav.tsx";
import "./globals.css";

export const metadata = {
  title: "ATS Resume Optimizer",
  description:
    "Compare a job posting against your resume, see every requirement matched against real evidence, and generate a tailored resume where every sentence is traceable to a fact.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
