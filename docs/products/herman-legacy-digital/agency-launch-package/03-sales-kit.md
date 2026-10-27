# Herman Legacy Digital — Sales Kit: Inquiry Questions, Lead Pipeline, Proposal Outline

**Status: DRAFT. Not published. No outreach is sent from this kit.**

## 1. Inquiry questions

There are two levels, so a small business is not handed a 10-section form for a $99/month service.

### 1a. Quick inquiry (website form and phone script)

This reuses the existing short form fields in `apps/herman-legacy-digital/src/lib/intake.ts`.
Items marked _(new)_ are proposed additions.

| #   | Question                                                                    | Required | Exists today               |
| --- | --------------------------------------------------------------------------- | -------- | -------------------------- |
| 1   | Business name                                                               | Yes      | Yes                        |
| 2   | Your name                                                                   | Yes      | Yes                        |
| 3   | Email                                                                       | Yes      | Yes                        |
| 4   | Phone                                                                       | No       | Yes                        |
| 5   | Current website (if any)                                                    | No       | Yes                        |
| 6   | Industry                                                                    | No       | Yes                        |
| 7   | What do you need help with? (website / Google listing / content / not sure) | No       | _(new)_                    |
| 8   | What is the biggest problem right now?                                      | No       | Yes (challenges)           |
| 9   | When would you like to start? (now / 1–3 months / just exploring)           | No       | _(new)_                    |
| 10  | How did you hear about us?                                                  | No       | Partly (UTM tags captured) |
| 11  | Privacy acknowledgment / consent to be contacted                            | Yes      | Yes                        |

Do **not** add an SMS opt-in checkbox until HLG has a registered texting number and approved consent
language.

### 1b. Discovery call (after the inquiry)

This uses the 10-section Business Transformation intake
(`docs/products/herman-legacy-digital/business-transformation-intake-v1.md`) as the source, cut to
what a website/visibility engagement needs:

1. What do you sell, and who is your best customer?
2. Where do new customers come from today? Roughly how many inquiries a week?
3. What happens when someone calls and you can't answer?
4. Do you have a Google Business Profile? Who has access to it?
5. Who owns your domain and current website? Where is it hosted?
6. Which tools do you already use (booking, invoicing, email, social)?
7. What would a good result look like 90 days from now?
8. Who makes the decision, and is there a budget range?
9. Facts we may publish: years in business, licences, service area, reviews. **We publish only
   what you confirm.**
10. Photos, logo and brand colours you can supply.

## 2. Lead pipeline

Eight stages. Each stage has an exit rule, so the pipeline count means something.

| #   | Stage                     | Enters when                                     | Exit rule (to move on)                                   | Tool today                                          |
| --- | ------------------------- | ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| 1   | **Prospect**              | Found by the Presence Scanner or a referral     | Qualified: real business, reachable, a visible gap       | Presence Scanner Lead Board                         |
| 2   | **Inquiry**               | Submitted the website form, called, or replied  | First reply sent within 1 business day                   | HLD form → lead destination (**must be set first**) |
| 3   | **Discovery booked**      | A call time is agreed                           | Call held                                                | Calendar (Keith's)                                  |
| 4   | **Assessed**              | Visibility Assessment run on their site         | Report reviewed with the owner                           | Presence Scanner Lead Card                          |
| 5   | **Proposal sent**         | Proposal (§3) delivered                         | Accepted, declined, or 14 days with no reply → follow-up | Proposal template                                   |
| 6   | **Won**                   | Agreement signed **and** first payment received | Onboarding checklist started                             | Agreement + invoice                                 |
| 7   | **Onboarding / Delivery** | Kickoff done                                    | Site live and client sign-off                            | `04-onboarding-and-launch-checklists.md`            |
| 8   | **Active (Care)**         | Monthly service running                         | Renewal or cancellation                                  | Website Care report                                 |

Closed-lost reasons (pick one): price · timing · chose another provider · no response ·
not a fit.

**Fields per lead:** business, contact, email, phone, source, stage, next action plus date,
services of interest, assessment score (and how many points were checked), proposal value
(**draft until prices are approved**), owner, notes.

**Where it lives:** Keith decides (decision #1 in the readiness report). Options, simplest first:

1. a shared spreadsheet with the fields above;
2. the existing CRM if HLG already uses one (a HubSpot connection exists on the Claude account;
   not inspected);
3. later, the HL-BOS `sales` schema (already in production per records) once a UI exists.

Do not build a new CRM.

**Weekly numbers to review (real counts only):** new inquiries, discovery calls held, proposals
sent, won, lost (with reasons), active care clients.

## 3. Proposal outline

One to three pages. The draft is filled from the discovery call and the assessment.

1. **Cover:** client business name, date, "Prepared by Herman Legacy Digital, a Herman Legacy
   Group company", proposal reference, valid for 30 days.
2. **What we heard:** the owner's goal and their biggest problem, in their words.
3. **What we found:** 3–5 findings from the Visibility Assessment, each with its evidence. State
   which checks were not run.
4. **What we recommend:** the services from the catalog (`02-service-catalog-and-website-care.md`),
   each tied to a finding.
5. **Scope:** for each service, what is included, what is not, and what the client provides.
6. **Timeline:** typical Launch Website is 2–3 weeks from receiving content and access.
7. **Investment:** one-time and monthly lines. **Only approved prices may appear here.**
8. **What we need from you:** content, photos, logo, domain/GBP access, a decision maker.
9. **Terms summary:** payment schedule, ownership, cancellation, with a pointer to the agreement.
10. **Next step:** sign the agreement and pay the first invoice. Kickoff within 5 business days.

**Never in a proposal:** guaranteed rankings, traffic or revenue; a statistic HLG has not
measured; another client's name without permission; a service marked "Not ready" in the catalog.
