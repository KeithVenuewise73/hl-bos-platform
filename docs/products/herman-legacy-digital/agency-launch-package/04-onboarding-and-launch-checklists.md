# Herman Legacy Digital — Client Onboarding and Agency Launch Checklists

**Status: DRAFT.**

## 1. Client onboarding checklist

Applies once a proposal is accepted.

### Before kickoff

- [ ] Agreement signed (attorney-reviewed template)
- [ ] First invoice paid
- [ ] Client record moved to **Won** in the pipeline
- [ ] Kickoff call scheduled within 5 business days

### Access (the client grants it; HLG never takes ownership)

- [ ] Domain registrar: DNS access, or client makes the DNS change with HLG's instructions
- [ ] Google Business Profile: HLG added as **Manager** (not Owner)
- [ ] Existing website / hosting login (if migrating)
- [ ] Social accounts, if Content Pack: posting access or a shared approval process
- [ ] Where contact-form messages should go (client's email address, confirmed by a test)

### Facts and content (published only when the client confirms them)

- [ ] Legal business name and the name used publicly
- [ ] Phone, email, address or service area
- [ ] Hours
- [ ] Services list with one line each
- [ ] Years in business, licences and insurance, **only if the client confirms in writing**
- [ ] Logo, brand colours, photos (client confirms they own the rights)
- [ ] Privacy policy: client supplies one, or approves HLG's template
- [ ] Reviews/testimonials: only real ones, with the reviewer's permission or from a public source

### Build and launch

- [ ] Profile entered in the Control Center (**Business Profiles**); unconfirmed facts stay off
      the page
- [ ] Draft built with the Site Builder; private preview link sent to client
- [ ] One round of revisions
- [ ] Client written sign-off on the preview
- [ ] Hosting set up (Keith approves per client), HTTPS working
- [ ] DNS pointed (client or HLG with access); old site retired only after the new one is verified
- [ ] Contact form test: a message arrives at the client's inbox
- [ ] Mobile check, page titles, structured data, Google Business Profile links to the site
- [ ] Baseline Visibility Assessment saved (month 0 for the care reports)
- [ ] Pipeline stage → **Active (Care)**; first monthly report date set

## 2. Agency launch checklist

Everything that must be true before HLD accepts its first paying client. Owner: **K** = Keith
decision or access, **E** = engineering.

### Website and inquiries

- [ ] **K** Choose where inquiries go (inbox, existing CRM, or approve migration 0031)
- [ ] **E** Configure lead delivery on the live site; prove it with one test submission that
      arrives
- [ ] **E** Remove the visitor's email address from the server log line
      (`apps/herman-legacy-digital/src/lib/persist.ts`)
- [ ] **K** Turn off auto-deploy of hermanlegacydigital.com from every `main` merge (deploy on
      approval instead)
- [ ] **K** Decide public positioning; **E** update the About copy that says "We are not a website
      company…" (`apps/herman-legacy-digital/src/lib/content.ts:130`)
- [ ] **E** Add a services page from the approved catalog (approved prices or "request a quote")
- [ ] **K** Real contact email and phone; **E** add them to `/contact`
- [ ] **E** Privacy policy page live
- [ ] **K** Decide on `app.` and `shops.hermanlegacydigital.com` (unmerged BarberOS code)
- [ ] **E** Update stale "not deployed" records (`apps/herman-legacy-digital/README.md`,
      `docs/products/herman-legacy-digital/release-1/*`, Control Center registry)

### Commercial

- [ ] **K** Approve prices for the launch services (drafts in `02-service-catalog-and-website-care.md`)
- [ ] **K** Agreement template reviewed by an attorney
- [ ] **K** Payment method: invoice or payment link from HLG's business account
- [ ] **K** Legal entity and name on invoices (HLG or HLD)
- [ ] **K** Hosting policy for client sites (Herman Legacy Cloud yes/no, cost covered by Care)

### Proof

- [ ] **E + K** One portfolio example cleaned (remove minors' data, fictional sponsors, "Live Now"
      claims) and labelled "HLG-owned"
- [ ] **K** HSCS repositioning branch reviewed; fabricated statistics removed from the live HSCS
      site before it is cited
- [ ] **E** Placeholder 555 numbers removed from the HLG-family sites before they are linked
      from the agency site

### Not required for launch (later)

- [ ] **K** Decide build vs. resell for missed-call text-back and review automation
- [ ] **K** If yes: A2P 10DLC brand and campaign registration; consent language reviewed
- [ ] **K** Google Places key for listing checks in assessments
- [ ] **K** Anthropic key for AI-written draft copy
- [ ] **K** Connect HLG social channels for publishing
