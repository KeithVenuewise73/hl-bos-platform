import Link from "next/link";

import { MarketingShell, Section } from "@/components/Marketing.tsx";

/**
 * Privacy policy.
 *
 * Written from what the code actually does, not from a template. Where a
 * statement would require a legal judgement we are not qualified to make, it
 * is marked for review rather than asserted — an invented compliance claim is
 * worse than an admitted gap.
 */
export const metadata = { title: "Privacy — ATS Resume Optimizer" };

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <Section title="Privacy">
        <p className="muted small">
          Last updated 17 September 2026. This describes how the software behaves. It is
          not legal advice, and the items marked <em>needs legal review</em> have not
          been reviewed by a lawyer.
        </p>
      </Section>

      <Section title="What we store">
        <ul>
          <li>
            <strong>Your account</strong> — email address and an authentication record,
            held by Supabase Auth.
          </li>
          <li>
            <strong>Your resume</strong> — the file text you upload or paste, the parsed
            structure, and every previous version you created.
          </li>
          <li>
            <strong>Your career facts</strong> — the statements you supply or confirm,
            each with its source.
          </li>
          <li>
            <strong>Job postings</strong> — the posting text you paste, plus the
            requirements and keywords extracted from it.
          </li>
          <li>
            <strong>Generated documents</strong> — tailored resumes, cover letters and
            interview preparation, with the evidence links behind each line.
          </li>
          <li>
            <strong>Applications</strong> — company, role, status, dates and notes you
            enter.
          </li>
          <li>
            <strong>Product counters</strong> — a fixed list of nine events (for example
            &ldquo;a resume was exported&rdquo;). These contain no resume text, no job
            titles and no employer names.
          </li>
        </ul>
      </Section>

      <Section title="Who can see it">
        <p>
          Each account can read only its own records. This is enforced by the database
          itself through row-level security, which is applied and forced on every table
          — not by application code that could be bypassed. There is no administrator
          view of your records and no cross-account access of any kind.
        </p>
        <p className="muted small">
          We can see aggregate counts of the nine product events. We cannot read your
          resume.
        </p>
      </Section>

      <Section title="AI providers">
        <p>
          The analysis, matching, scoring, resume generation and export all run on a
          built-in rules engine on our own server. No third-party AI provider is
          involved in any of it.
        </p>
        <p>
          <strong>If</strong> this installation is configured with an Anthropic API key,
          two steps additionally send text to Anthropic: re-reading a job posting you
          pasted, and proposing phrasing for resume bullets, which includes the relevant
          career facts. Settings shows whether a key is configured for your
          installation. Nothing is sent to any AI provider when no key is set.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Settings has two controls. <strong>Delete all sample data</strong> removes the
          fictional demo records. <strong>Delete my account and all data</strong>{" "}
          removes every record listed above, permanently, and signs you out. Deletion is
          immediate and is not recoverable by us.
        </p>
        <p className="muted small">
          Your authentication record with Supabase is removed by the same action where
          the platform permits it; if it cannot be, we tell you on screen rather than
          claiming it was.
        </p>
      </Section>

      <Section title="Things that need legal review">
        <ul className="small">
          <li>
            <em>Needs legal review</em> — the lawful basis for processing under UK/EU
            GDPR and the retention period after account closure.
          </li>
          <li>
            <em>Needs legal review</em> — whether a data processing agreement is
            required for coaches who put their clients&rsquo; resumes into the product.
          </li>
          <li>
            <em>Needs legal review</em> — the CCPA/CPRA disclosures, and international
            transfer terms for the hosting and AI providers.
          </li>
        </ul>
        <p className="small">
          We would rather list these openly than publish a policy that implies a review
          nobody has done.
        </p>
      </Section>

      <Section title="Contact">
        <p className="small">
          Questions about any of this, or a deletion request you would rather we ran for
          you: reply to the email that brought you here. See also{" "}
          <Link href="/data-handling">Your data</Link>.
        </p>
      </Section>
    </MarketingShell>
  );
}
