import Link from "next/link";

import { MarketingShell, Section } from "@/components/Marketing.tsx";

/**
 * The landing page.
 *
 * The positioning is deliberately not "beat the ATS". That claim is the
 * category norm and we cannot honour it: an employer's system is not something
 * we can see, and the research on auto-rejection does not support the promise.
 * What this product can actually guarantee is narrower and more useful — that
 * every important line traces to something the candidate did — so that is what
 * the page says.
 */
export const metadata = {
  title: "Build a resume you can defend in the interview",
  description:
    "Tailor your resume to a specific job while keeping every important claim grounded in experience you can actually explain.",
};

const FEATURES: readonly { name: string; detail: string }[] = [
  {
    name: "Job posting analysis",
    detail: "Requirements pulled out and ranked by how much the posting leans on them.",
  },
  {
    name: "Resume alignment",
    detail: "Each requirement matched against the evidence you actually have.",
  },
  {
    name: "Evidence matrix",
    detail: "Requirement, your evidence, where it came from, and what to do about it.",
  },
  {
    name: "Keyword and terminology",
    detail:
      "The posting's vocabulary for things you have already done — never for things you have not.",
  },
  {
    name: "Claim validation",
    detail: "Every generated sentence checked against its evidence before you see it.",
  },
  {
    name: "ATS-friendly generation",
    detail:
      "Clean structure, parseable dates, no tables or columns to confuse a parser.",
  },
  {
    name: "DOCX / PDF / TXT export",
    detail: "Client-ready documents. Unsupported lines are dropped, not exported.",
  },
  {
    name: "Interview preparation",
    detail: "Questions you should be ready to explain, including your weak spots.",
  },
  {
    name: "Application tracking",
    detail: "Company, role, status, dates and which resume version you sent.",
  },
];

export default function WelcomePage() {
  return (
    <MarketingShell>
      <section className="hero">
        <h1>Build a Resume You Can Defend in the Interview</h1>
        <p className="hero-sub">
          Tailor your resume to a specific job while keeping every important claim
          grounded in experience you can actually explain.
        </p>
        <p className="hero-cta">
          <Link className="btn btn-primary" href="/signup">
            Analyze my resume
          </Link>
          <Link className="btn" href="/pricing#coach">
            For career coaches
          </Link>
        </p>
      </section>

      <Section
        title="The problem with letting AI write your resume"
        lede="AI resume tools are good at wording. They are also willing to invent."
      >
        <p>
          Ask a general-purpose model to make your experience fit a posting and it will
          happily add a metric you never measured, a system you never used, or a team
          you never led. It reads well. It gets you the interview. Then someone asks you
          to walk them through the $4M programme you did not run, and the tool that
          wrote that sentence is not in the room with you.
        </p>
        <p>
          Recruiters are seeing this at scale — industry reporting in 2026 put the share
          of recruiters encountering AI-fabricated applications at around 72%. The
          practical consequence for an honest candidate is that a polished resume is no
          longer automatically a trusted one.
        </p>
      </Section>

      <Section
        title="What this does instead"
        lede="Three inputs, five outputs, and a rule that is enforced rather than promised."
      >
        <p className="pipeline">
          <span>Job posting</span>
          <span aria-hidden="true">+</span>
          <span>Your experience</span>
          <span aria-hidden="true">+</span>
          <span>Your resume</span>
        </p>
        <p className="pipeline pipeline-out">
          <span>Evidence matrix</span>
          <span aria-hidden="true">→</span>
          <span>Match analysis</span>
          <span aria-hidden="true">→</span>
          <span>Tailored resume</span>
          <span aria-hidden="true">→</span>
          <span>Claim validation</span>
          <span aria-hidden="true">→</span>
          <span>Interview prep</span>
        </p>
      </Section>

      <Section
        title="Every Important Claim Has Evidence"
        lede="Generated statements are connected to information you supplied. Unsupported claims are flagged, not quietly inserted."
      >
        <p>
          When the tool writes a sentence, it records which of your own facts it came
          from. If a sentence contains a number your evidence does not, it is marked{" "}
          <strong>unsupported</strong> and never reaches an exported document. If it
          uses a word your evidence does not license, it is marked{" "}
          <strong>needs confirmation</strong> and waits for you.
        </p>
        <p>
          Confirming a flagged line does not flip a switch — it stores what you told us
          as a fact in your own profile, so the claim becomes supported because evidence
          now exists, not because a warning was dismissed.
        </p>
        <p className="muted small">
          This is checked in the application, checked again when a document is exported,
          and constrained in the database itself.
        </p>
      </Section>

      <Section title="What you get">
        <ul className="feature-grid">
          {FEATURES.map((f) => (
            <li key={f.name}>
              <strong>{f.name}</strong>
              <span className="muted small">{f.detail}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Scale Resume Work Without Losing Control of the Facts"
        lede="For career coaches, resume writers and outplacement consultants."
      >
        <p>
          Help clients tailor resumes faster while keeping an evidence trail for the
          claims being made. Every sentence you hand a client carries its source, so
          when they ask &ldquo;can I actually say this?&rdquo; the answer is on the
          screen rather than in your memory.
        </p>
        <p className="hero-cta">
          <Link className="btn btn-primary" href="/pricing#coach">
            Join the career coach pilot
          </Link>
        </p>
      </Section>
    </MarketingShell>
  );
}
