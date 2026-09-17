import Link from "next/link";

import { MarketingShell, Section } from "@/components/Marketing.tsx";

/**
 * Your data, in operational terms.
 *
 * The privacy page is the policy. This is the plain answer to "where exactly
 * does my resume go", written so somebody deciding whether to upload a real
 * career history can decide it in two minutes.
 */
export const metadata = { title: "Your data — ATS Resume Optimizer" };

export default function DataHandlingPage() {
  return (
    <MarketingShell>
      <Section
        title="Your data"
        lede="A resume is one of the most personal documents most people own. Here is exactly what happens to it."
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>What</th>
              <th>Where it goes</th>
              <th>Who can read it</th>
              <th>How to remove it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Resume file and text</td>
              <td>Our PostgreSQL database, in your own rows</td>
              <td>Your account only</td>
              <td>Delete account, in Settings</td>
            </tr>
            <tr>
              <td>Career facts</td>
              <td>Same</td>
              <td>Your account only</td>
              <td>Individually, or delete account</td>
            </tr>
            <tr>
              <td>Job posting text</td>
              <td>Same</td>
              <td>Your account only</td>
              <td>Delete account</td>
            </tr>
            <tr>
              <td>Generated resumes and cover letters</td>
              <td>Same</td>
              <td>Your account only</td>
              <td>Delete account</td>
            </tr>
            <tr>
              <td>Exported DOCX / PDF / TXT</td>
              <td>
                Generated on request and streamed to your browser. No copy of the file
                is kept on our side
              </td>
              <td>You, and wherever you send it</td>
              <td>Delete it from your own device</td>
            </tr>
            <tr>
              <td>Product counters</td>
              <td>Nine fixed event names, with no document content</td>
              <td>Your account; we see aggregate totals</td>
              <td>Delete account</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="Does an AI provider see my resume?">
        <p>
          <strong>By default, no.</strong> Every feature — parsing, requirement
          matching, keyword analysis, scoring, resume generation, claim validation and
          export — runs on a rules engine on our own server.
        </p>
        <p>
          If an Anthropic API key is configured for the installation you are using, two
          optional steps send text to Anthropic: the job posting you pasted, and the
          career facts relevant to a bullet being rephrased. Settings tells you which
          applies to you. No other provider receives anything.
        </p>
      </Section>

      <Section title="Deleting an account">
        <p>
          Settings → <strong>Delete my account and all data</strong>. It asks you to
          type the word <code>DELETE</code> first, because this removes your resumes,
          facts, analyses, generated documents and applications permanently and we
          cannot undo it.
        </p>
      </Section>

      <Section title="If you are a coach putting a client's resume in">
        <p>
          The client&rsquo;s data lives in your account and is visible to you. Make sure
          you have their agreement before uploading their history. A formal data
          processing agreement for this case is on our list and is{" "}
          <em>not yet written</em> — see <Link href="/privacy">Privacy</Link>.
        </p>
      </Section>
    </MarketingShell>
  );
}
