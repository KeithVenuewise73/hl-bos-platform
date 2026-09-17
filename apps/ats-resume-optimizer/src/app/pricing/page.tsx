import Link from "next/link";

import { MarketingShell, Section } from "@/components/Marketing.tsx";
import { paymentLinks } from "@/lib/config.ts";
import { PayButton } from "@/components/PayButton.tsx";

/**
 * Pricing.
 *
 * Both offers are deliberately not subscriptions. A job search ends, and
 * charging monthly for a thing someone needs for nine weeks is how this
 * category earns its reputation for hard-to-cancel billing. The coach offer is
 * a pilot, priced to be a decision someone can make alone.
 *
 * If a payment link is not configured, the button is replaced by an honest
 * note. A checkout button that goes nowhere is worse than no button.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing — ATS Resume Optimizer",
  description: "A 90-day job search pass, and a pilot for career coaches.",
};

export default function PricingPage() {
  const links = paymentLinks();
  return (
    <MarketingShell>
      <Section
        title="Pricing"
        lede="Two offers, both finite. Neither one bills you every month until you remember to stop it."
      >
        <div className="price-grid">
          <div className="card price-card">
            <h3>90-Day Job Search Pass</h3>
            <p className="price">$39</p>
            <p className="muted small">One payment. Ninety days of full access.</p>
            <ul className="small">
              <li>Unlimited job analyses</li>
              <li>Evidence matrix and claim validation</li>
              <li>Tailored resumes, DOCX / PDF / TXT</li>
              <li>Cover letters and interview preparation</li>
              <li>Application tracking</li>
            </ul>
            <PayButton
              href={links.consumer}
              audience="consumer"
              label="Get the 90-day pass"
            />
          </div>

          <div className="card price-card" id="coach">
            <h3>Career Coach Pilot</h3>
            <p className="price">$99</p>
            <p className="muted small">
              Run three clients through the system and decide from the output.
            </p>
            <ul className="small">
              <li>Three client workflows, end to end</li>
              <li>Evidence-backed tailored resumes</li>
              <li>Interview-defensibility analysis per client</li>
              <li>Client-ready DOCX and PDF exports</li>
              <li>Direct line to us while you run it</li>
            </ul>
            <PayButton
              href={links.coach}
              audience="coach"
              label="Join the coach pilot"
            />
          </div>
        </div>
      </Section>

      <Section title="What you are not buying">
        <p>
          You are not buying a guaranteed interview, and you are not buying a way past
          an employer&rsquo;s applicant tracking system. We cannot see that system and
          would not know if we had. The internal optimization score is our own measure
          of how well a resume lines up with a posting; it does not predict whether
          anyone will contact you.
        </p>
        <p>
          What you are buying is the other half: a resume tailored hard to the posting,
          where every important line traces back to something you actually did.
        </p>
      </Section>

      <Section title="Questions">
        <p className="small">
          <strong>Do I need an AI subscription?</strong> No. The analysis, matching,
          scoring, generation and export all run on a built-in rules engine. An AI key
          is optional and only changes phrasing.
        </p>
        <p className="small">
          <strong>What happens to my data?</strong> See{" "}
          <Link href="/data-handling">Your data</Link>. You can delete everything,
          including your account, from Settings.
        </p>
        <p className="small">
          <strong>Refunds?</strong> Email us within the first week and we will refund
          it. We would rather have the feedback than the $39.
        </p>
      </Section>
    </MarketingShell>
  );
}
