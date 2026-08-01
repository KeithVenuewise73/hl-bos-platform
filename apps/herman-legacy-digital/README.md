# Herman Legacy Digital

The customer-facing AI-powered Business Transformation company —
**hermanlegacydigital.com**. A public marketing + assessment-intake site and an
authenticated client portal, **assembled on HL-BOS** (it reuses the portfolio,
VisibilityAI, HL-BTI, the customer lifecycle, HL-BOS identity, and the Executive
Portal deployment pattern). It introduces **no** duplicate identity, CRM,
workflow, billing, or portal systems.

- **Run locally:** `pnpm --filter @hl-bos/herman-legacy-digital dev` (port 4400).
- **Public routes:** Home, About, How We Transform, Solutions, Industries,
  Visibility Assessment, Marketing & Growth, Innovation Marketplace, Resources,
  Book an Assessment, Contact, Client Login.
- **Authenticated:** `/portal` (gated in middleware; HL-BOS Supabase Auth).
- **Intake:** `POST /api/intake` validates and captures a lead into the customer
  lifecycle. It never claims a completed AI assessment; delivery to the CRM is a
  deploy-time env (`HLD_INTAKE_WEBHOOK_URL`).
- **Health:** `GET /api/health`.

Honesty (Principle 10): the portal shows real data or an honest no-data state;
the public marketplace exposes no internal metrics; reference businesses are
labeled in-progress / baseline-pending; analytics records events only.

Release 1 is built and validated but **not deployed**. See
`docs/products/herman-legacy-digital/release-1/` for the reuse map, deployment/DNS
runbook, validation report, and CEO walkthrough. DNS to the domain awaits CEO
authorization.
