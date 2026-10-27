# Herman Legacy Digital — Service Catalog and Website Care Scope

**Status: DRAFT. Not approved. Not published.**

> **Every price in this document is a DRAFT for CEO decision.** These are placeholders sized for
> small Western New York service businesses, not market research. None of them is in the
> database: `sales.prices` stays empty and every catalog row stays `pending-ceo:<key>` until Keith
> approves a number.

Service keys match the existing catalog in migration 0023 (`supabase/migrations/*_hlbos_0023_*.sql`),
so an approved price can later be entered against the same key without new schema.

## Readiness labels

- **Ready:** HLG can deliver it today with existing tools plus manual work.
- **Ready (manual):** deliverable, but by a person, not software.
- **Not ready:** do not sell yet; the reason is given.

## Launch services

### 1. Visibility Assessment

`search_visibility` / `local_visibility` · **Ready**

An evidence-based review of how a business shows up online:

- website basics: HTTPS, mobile, contact options, calls to action, structured data;
- Google listing and reviews (only when the Places key is added; otherwise marked "not checked");
- a ranked list of fixes.

Delivered as a written report plus a 30-minute walkthrough.

- **Built on:** Presence Scanner (`packages/presence-scanner`, Control Center `/presence`).
- **Honesty:** the report states which checks ran and which did not. No traffic, ranking or
  revenue numbers are estimated.
- **DRAFT price:** free as the front-door offer; paid "deep assessment" with a competitor
  comparison **$350 one-time (DRAFT)**.

### 2. Launch Website

`website_creation` / `website_modernization` · **Ready**

A professional site of up to 5 pages: home, services, about, contact/quote, and a privacy page.

- Built from the business's verified facts only.
- Mobile-first, a contact form that delivers to the client's inbox, basic on-page SEO and
  structured data.
- One round of revisions before launch.
- **Built on:** Instant Site Builder (`packages/site-builder`), templates for contractor,
  salon/barber, restaurant/bar and professional services. Fabrication guard on all copy.
- **Not included:** e-commerce, online booking engines, custom software, logo design.
- **DRAFT price:** **$1,800 one-time (DRAFT)**, or **$0 down with 12 months of Website Care Plus
  (DRAFT)**. Keith to choose whether to offer the financed option.

### 3. Website Care (monthly)

`hosting_support` · **Ready (manual)**. Full scope below.

- **DRAFT price:** Essential **$99/mo (DRAFT)** · Plus **$199/mo (DRAFT)**.

### 4. Local Visibility Setup

`local_visibility` · **Ready (manual)**

- Claim or verify the Google Business Profile.
- Complete categories, hours, services, photos and description.
- Fix name/address/phone consistency on the top directories.
- Add the review link to the website.
- **Requires:** the client grants manager access to their Google Business Profile. HLG never
  takes ownership.
- **DRAFT price:** **$450 one-time (DRAFT)**.

### 5. Content Pack (monthly)

`marketing` · **Ready (manual)**

- 8 social posts per month: graphic or photo plus caption.
- 1 short promo video from the client's photos (Video Studio).
- 1 website update or blog post.
- Client approves everything before it is posted. Posting is manual until social channels are
  connected and approved.
- **DRAFT price:** **$400/mo (DRAFT)**.

## Not ready: do not sell yet

| Service                                                | Catalog key              | Why not                                                                                        | What would make it ready                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5-Star Lead Recovery** (missed-call text-back)       | `missed_call_recovery`   | No software exists. The SMS adapter is inert. No A2P 10DLC registration.                       | Keith decides build vs. resell a licensed platform; Twilio (or similar) account; A2P 10DLC brand + campaign approved; consent language; build or configure; test on HLG's own number first. |
| **5-Star Review Reminder** (automated review requests) | `review_management`      | No sender and no Google Business Profile connector. SMS has the same registration requirement. | Same as above for SMS. An **email + printed QR-code version** can be offered manually now (same message to every customer, no review gating).                                               |
| Online booking                                         | `appointment_scheduling` | Not built on `main`.                                                                           | Use the client's existing booking tool, linked from the site.                                                                                                                               |
| AI receptionist                                        | `ai_receptionist`        | Not built.                                                                                     | —                                                                                                                                                                                           |

**Draft placeholder for later (not for sale):** Lead Recovery **$149/mo + $250 setup (DRAFT)**;
Review Reminder **$79/mo (DRAFT)**. Shown only so the price ladder can be discussed.

## Suggested bundles (DRAFT)

| Bundle         | Contents                                                         | DRAFT price                          |
| -------------- | ---------------------------------------------------------------- | ------------------------------------ |
| **Get Found**  | Launch Website + Local Visibility Setup + Website Care Essential | $2,100 one-time + $99/mo (**DRAFT**) |
| **Stay Found** | Website Care Plus + Content Pack                                 | $549/mo (**DRAFT**)                  |

---

## Website Care: defined scope

Applies to sites HLG built and hosts. A site built elsewhere needs a one-time onboarding review
before HLG can take on its care (DRAFT price: **$150 (DRAFT)**).

### Included in both tiers

| Area                 | What HLG does                                                                             | How it is done today                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Hosting              | Site hosted on Herman Legacy Cloud with HTTPS.                                            | Coolify (already running HLG apps). Needs Keith's per-client approval. |
| Uptime               | Health check every few minutes; HLG is alerted when the site is down.                     | Coolify health check on the site.                                      |
| Security and updates | Platform and dependency updates applied monthly; critical fixes within 2 business days.   | Engineering, through the normal PR and test process.                   |
| Backups              | Site source kept in version control; restorable to any earlier version.                   | Git history plus redeploy of a previous version.                       |
| Form check           | Contact form tested monthly to confirm messages arrive.                                   | Manual test submission.                                                |
| Small content edits  | Essential: up to 30 min/month. Plus: up to 2 hours/month (text, photos, hours, services). | Manual.                                                                |
| Monthly report       | One-page report (template below).                                                         | Presence Scanner re-run plus manual notes.                             |
| Support              | Email support, reply within 1 business day.                                               | Manual.                                                                |

### Plus tier only

- Quarterly 30-minute review call.
- Google Business Profile upkeep: hours, posts, photos (needs manager access).
- One new page or section per quarter, up to 2 hours.

### Not included

New features, redesigns, e-commerce, paid advertising management, copywriting beyond the edit
allowance, third-party subscription fees (domain, email, booking tools), legal content (the client
supplies their privacy terms or approves a template).

### Ownership

The client owns their domain, content and Google Business Profile. HLG hosts and maintains the
site. On cancellation, HLG hands over a ZIP of the site and points DNS wherever the client
chooses. Final terms are subject to the attorney-reviewed agreement.

### Monthly report template

```
WEBSITE CARE REPORT — <Business name> — <Month YYYY>
Prepared by Herman Legacy Digital

1. Site status
   Uptime this month: <from health checks, or "not measured">
   Updates applied: <list, or "none needed">
   Contact form test: <date> — <arrived / failed and fixed>

2. Visibility check (Presence Scanner, <date>)
   Score: <n> on <n> points checked  (last month: <n>)
   Checks not run: <list and why>
   Changes since last month: <list>

3. Work done
   <edit 1> (<minutes>)
   Remaining allowance: <minutes>

4. Recommended next steps
   <1–3 items, each tied to a finding above>

Numbers in this report come from the checks listed. Where something was not measured,
it says so.
```
