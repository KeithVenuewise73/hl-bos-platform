"use client";

import { getSupabase } from "./supabase";

// ---------------------------------------------------------------------------
// The RPC surface, typed.
//
// This file is the ONLY place in the cockpit that names an RPC. Every function
// here calls a `public.barberos_*` or `public.barberos_audit_*` function from
// migrations 0052, 0055 and 0056 — nothing else. There is no table read, no
// `.from()`, and no schema access anywhere in this app, because `barberos` and
// `transform_audit` are not exposed through PostgREST and must not be: the
// permission check lives inside each RPC and that is the only authority.
//
// Consequences worth stating, because they shape every screen:
//
//   * A refusal is a PostgreSQL error, not a boolean. 42501 means the operator
//     lacks the permission; 23514 means a rule refused the operation (a
//     capability that has not shipped, a proposal that names something
//     unbuilt, an onboarding with no accepted sale); 23505 means it already
//     happened. The UI must show these as sentences, never swallow them.
//   * Nothing here can be "optimistically" applied. A control that reported
//     success before the RPC returned would be a control that does not
//     control anything.
// ---------------------------------------------------------------------------

export class RpcError extends Error {
  readonly code: string;
  readonly context: string;
  constructor(context: string, message: string, code: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.context = context;
  }
}

/** True when the database refused for want of a permission, not a rule. */
export function isPermissionRefusal(e: unknown): boolean {
  return e instanceof RpcError && e.code === "42501";
}

async function rpc<T>(
  context: string,
  fn: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const res = await getSupabase().rpc(fn, args ?? {});
  if (res.error) {
    throw new RpcError(context, res.error.message, res.error.code ?? "");
  }
  return res.data as T;
}

/** Turn any thrown value into one sentence an operator can act on. */
export function describeError(e: unknown): string {
  if (e instanceof RpcError) return `${e.context}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

// ── Agencies (0056) ────────────────────────────────────────────────────────

export interface AgencyCan {
  read_audits: boolean;
  run_audits: boolean;
  manage_campaigns: boolean;
  manage_shops: boolean;
  manage_discovery: boolean;
  manage_proposals: boolean;
  /** Needs the agency sale permission AND platform.tenant.create. */
  onboard_clients: boolean;
}
export interface Agency {
  tenant_id: string;
  name: string;
  slug: string;
  can: AgencyCan;
}

export function myAgencies(): Promise<Agency[]> {
  return rpc<Agency[]>("Could not load your agencies", "barberos_audit_my_agencies");
}

// ── The capability catalog (0056) ──────────────────────────────────────────

export type CapabilityStatus = "available" | "planned" | "deferred";

export interface CapabilityRequirement {
  key: string;
  reason: string;
}
export interface Capability {
  key: string;
  name: string;
  category: string;
  description: string;
  status: CapabilityStatus;
  is_available: boolean;
  is_default: boolean;
  version: number;
  locked_config_keys: string[];
  blocked_on: string | null;
  blocker_owner: "ceo" | "engineering" | null;
  requires: CapabilityRequirement[];
}
export interface Bundle {
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  shipped: number;
  total: number;
  /** apply_bundle() is all-or-nothing, so this is too. */
  deliverable_today: boolean;
  blocked_by: string[];
}
export interface Catalog {
  capabilities: Capability[];
  bundles: Bundle[];
}

export function catalog(): Promise<Catalog> {
  return rpc<Catalog>("Could not load the capability catalog", "barberos_catalog");
}

export interface EnabledCapability {
  capability_key: string;
  name: string;
  status: CapabilityStatus;
  enabled_at: string;
  enabled_via: "individual" | "bundle" | "audit_recommendation";
  bundle_key: string | null;
  source_ref: string | null;
  config: Record<string, unknown>;
}

export function capabilityState(tenant: string): Promise<EnabledCapability[]> {
  return rpc<EnabledCapability[]>(
    "Could not read what is switched on for this shop",
    "barberos_capability_state",
    { p_tenant: tenant },
  );
}

export function enableCapability(
  tenant: string,
  key: string,
  sourceRef?: string,
): Promise<boolean> {
  return rpc<boolean>(
    "Could not switch this capability on",
    "barberos_enable_capability",
    {
      p_tenant: tenant,
      p_capability: key,
      p_via: sourceRef ? "audit_recommendation" : "individual",
      p_source_ref: sourceRef ?? null,
    },
  );
}

export function disableCapability(tenant: string, key: string): Promise<boolean> {
  return rpc<boolean>(
    "Could not switch this capability off",
    "barberos_disable_capability",
    {
      p_tenant: tenant,
      p_capability: key,
    },
  );
}

export function applyBundle(tenant: string, key: string): Promise<number> {
  return rpc<number>("Could not apply this bundle", "barberos_apply_bundle", {
    p_tenant: tenant,
    p_bundle: key,
  });
}

// ── The pipeline (0056) ────────────────────────────────────────────────────

export interface Coverage {
  scored: number;
  possible: number;
}
export interface PipelineRun {
  run_id: string;
  status: "running" | "completed" | "partially_completed" | "failed";
  composite_score: number | null;
  coverage: Coverage;
  findings: number;
  evidenced_findings: number;
  has_outreach_hook: boolean;
  started_at: string;
  finished_at: string | null;
}
export type ProposalStatus = "draft" | "sent" | "accepted" | "declined" | "withdrawn";
export interface PipelineProposal {
  id: string;
  status: ProposalStatus;
  created_at: string;
  sent_at: string | null;
  decided_at: string | null;
}
export interface PipelineEntry {
  prospect_id: string;
  business_name: string;
  phone: string | null;
  locality: string | null;
  region: string | null;
  website_url: string | null;
  has_gbp: boolean;
  discovery: { answered_at: string | null } | null;
  latest_run: PipelineRun | null;
  runs: number;
  latest_proposal: PipelineProposal | null;
  proposals: number;
  onboarding: {
    onboarded_at: string;
    shop_name: string | null;
    client_tenant_id: string | null;
  } | null;
}

export function pipeline(tenant: string, search?: string): Promise<PipelineEntry[]> {
  return rpc<PipelineEntry[]>(
    "Could not load the pipeline",
    "barberos_audit_pipeline",
    {
      p_tenant: tenant,
      p_search: search?.trim() ? search.trim() : null,
    },
  );
}

// ── Campaigns, prospects and audit runs (0055) ─────────────────────────────

export type Dimension = "website" | "google_business" | "social" | "competitor";
export type Confidence = "verified" | "inferred" | "unknown";
export type Severity = "critical" | "high" | "medium" | "info";
export type Priority = "quick_win" | "structural";

export interface Campaign {
  id: string;
  key: string;
  name: string;
  status: "draft" | "active" | "closed";
  weights: Record<string, number>;
  runs: number;
  created_at: string;
}

export function campaigns(tenant: string): Promise<Campaign[]> {
  return rpc<Campaign[]>("Could not load campaigns", "barberos_audit_campaigns", {
    p_tenant: tenant,
  });
}

export function saveCampaign(
  tenant: string,
  key: string,
  name: string,
  weights: Record<string, number>,
): Promise<string> {
  return rpc<string>("Could not save the campaign", "barberos_audit_save_campaign", {
    p_tenant: tenant,
    p_key: key,
    p_name: name,
    p_weights: weights,
  });
}

export interface ShopImport {
  business_name: string;
  phone?: string;
  address_line1?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  website_url?: string;
  website_platform?: string;
  gbp_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  source_file?: string;
}

export function importShop(tenant: string, row: ShopImport): Promise<string> {
  return rpc<string>("Could not save the shop", "barberos_audit_import_shop", {
    p_tenant: tenant,
    p_row: row,
  });
}

export function startRun(campaign: string, prospect: string): Promise<string> {
  return rpc<string>("Could not start the audit", "barberos_audit_start_run", {
    p_campaign: campaign,
    p_prospect: prospect,
  });
}

export function recordFinding(args: {
  run: string;
  dimension: Dimension;
  code: string;
  statement: string;
  confidence: Confidence;
  severity: Severity;
  evidenceUrl: string | null;
}): Promise<number> {
  return rpc<number>("Could not record the finding", "barberos_audit_record_finding", {
    p_run: args.run,
    p_dimension: args.dimension,
    p_code: args.code,
    p_statement: args.statement,
    p_confidence: args.confidence,
    p_severity: args.severity,
    p_evidence_url: args.evidenceUrl,
  });
}

export function recordDimension(args: {
  run: string;
  dimension: Dimension;
  score: number | null;
  confidence: Confidence;
  rubric: string;
  note: string;
}): Promise<number | null> {
  return rpc<number | null>(
    "Could not score the dimension",
    "barberos_audit_record_dimension",
    {
      p_run: args.run,
      p_dimension: args.dimension,
      p_score: args.score,
      p_confidence: args.confidence,
      p_rubric_version: args.rubric,
      p_note: args.note,
    },
  );
}

export function addRecommendation(args: {
  run: string;
  priority: Priority;
  title: string;
  detail: string;
  capability: string | null;
  addresses: number | null;
  rank: number;
}): Promise<number> {
  return rpc<number>(
    "Could not add the recommendation",
    "barberos_audit_add_recommendation",
    {
      p_run: args.run,
      p_priority: args.priority,
      p_title: args.title,
      p_detail: args.detail,
      p_capability: args.capability,
      p_addresses: args.addresses,
      p_rank: args.rank,
    },
  );
}

export function setHook(run: string, finding: number, hook: string): Promise<null> {
  return rpc<null>("Could not set the outreach hook", "barberos_audit_set_hook", {
    p_run: run,
    p_finding: finding,
    p_hook: hook,
  });
}

export function finishRun(run: string, error?: string): Promise<string> {
  return rpc<string>("Could not finish the audit", "barberos_audit_finish_run", {
    p_run: run,
    p_error: error ?? null,
  });
}

export interface ReportFinding {
  code: string;
  dimension: Dimension;
  statement: string;
  evidence_url: string | null;
  confidence: Confidence;
  severity: Severity;
  detector: string;
}
export interface ReportScore {
  dimension: Dimension;
  score: number | null;
  confidence: Confidence;
  rubric_version: string;
  note: string;
}
export interface ReportRecommendation {
  priority: Priority;
  rank: number;
  title: string;
  detail: string;
  capability_key: string | null;
  addresses_finding_id: number | null;
}
export interface Report {
  run_id: string;
  status: string;
  shop: { business_name: string; website_url: string | null; city: string | null };
  weights: Record<string, number>;
  coverage: Coverage;
  composite_score: number | null;
  scorecard: ReportScore[];
  unscored_dimensions: string[];
  findings: ReportFinding[];
  recommendations: ReportRecommendation[];
  outreach_hook: string | null;
}

export function report(run: string): Promise<Report> {
  return rpc<Report>("Could not load the audit report", "barberos_audit_report", {
    p_run: run,
  });
}

export interface BundleLine {
  capability_key: string;
  capability_name: string;
  status: CapabilityStatus;
  is_shipped: boolean;
  priority: Priority;
  rank: number;
}

export function recommendedBundle(run: string): Promise<BundleLine[]> {
  return rpc<BundleLine[]>(
    "Could not load the recommended capabilities",
    "barberos_audit_bundle",
    { p_run: run },
  );
}

// ── Discovery call (0055) ────────────────────────────────────────

// Three-valued on purpose. `false` is an answer ("they have no website");
// `null` is the absence of one ("we did not ask"). The form must offer both and
// must never default a question to false, because record_discovery() only
// stamps answered_at when something was actually supplied.
export interface DiscoveryAnswers {
  own_website?: boolean | null;
  booking_platform?: string | null;
  online_booking?: boolean | null;
  missed_call_handling?: boolean | null;
  review_process?: boolean | null;
  client_records?: boolean | null;
  takes_walkins?: boolean | null;
  chairs?: number | null;
  notes?: string | null;
}

/** discovery_for() answers for a prospect with no row too, so `called` is the flag. */
export interface Discovery extends DiscoveryAnswers {
  prospect_id: string;
  called: boolean;
  answered_at: string | null;
}

export function discovery(prospect: string): Promise<Discovery> {
  return rpc<Discovery>(
    "Could not load the discovery call",
    "barberos_audit_discovery",
    {
      p_prospect: prospect,
    },
  );
}

export function recordDiscovery(
  prospect: string,
  answers: DiscoveryAnswers,
): Promise<string> {
  return rpc<string>(
    "Could not save the discovery call",
    "barberos_audit_record_discovery",
    {
      p_prospect: prospect,
      p_answers: answers,
    },
  );
}

// ── Proposals (0055) ────────────────────────────────────────────

export interface OfferLine {
  capability: string;
  /**
   * The schema checks this. enforce_proposal_honesty() rejects the whole
   * document if a line claims deliverable_today for a capability the catalog
   * does not mark 'available', so the builder must derive it from the catalog
   * rather than let an operator type it.
   */
  deliverable_today: boolean;
  note: string;
}

/**
 * Pricing is DATA. It lives in the proposal document, which is free-form jsonb
 * apart from the `offer` array the honesty trigger inspects, so the commercial
 * model changes without a migration and without a deploy. Nothing in this app
 * hardcodes a price; PRICING_DEFAULTS in model.ts is a starting value the
 * operator edits per proposal, and what is stored is what they saw.
 */
export interface Pricing {
  currency: string;
  setup_cents: number;
  monthly_cents: number;
  term_months: number | null;
}

/** A finding quoted to the shop, carried WITH its confidence so the document cannot launder an inference into a fact. */
export interface CitedFinding {
  code: string;
  statement: string;
  confidence: Confidence;
  evidence_url: string | null;
}

export interface ProposalDocument {
  headline: string;
  summary: string;
  pricing: Pricing;
  offer: OfferLine[];
  cited_findings: CitedFinding[];
  /** Set when the document was built from an audit run, for provenance. */
  from_run: string | null;
  /** Counted at draft time so a reader can see the evidence base of the quote. */
  evidence: { findings: number; evidenced: number } | null;
}

export interface ProposalSummary {
  id: string;
  status: ProposalStatus;
  created_at: string;
  sent_at: string | null;
  decided_at: string | null;
  offer_lines: number;
}

export interface Proposal {
  id: string;
  prospect_id: string;
  run_id: string | null;
  status: ProposalStatus;
  document: ProposalDocument;
  created_at: string;
  sent_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export function proposals(prospect: string): Promise<ProposalSummary[]> {
  return rpc<ProposalSummary[]>(
    "Could not load proposals",
    "barberos_audit_proposals",
    {
      p_prospect: prospect,
    },
  );
}

export function proposal(id: string): Promise<Proposal | null> {
  return rpc<Proposal | null>(
    "Could not load the proposal",
    "barberos_audit_proposal",
    {
      p_id: id,
    },
  );
}

export function draftProposal(
  prospect: string,
  run: string | null,
  document: ProposalDocument,
): Promise<string> {
  return rpc<string>("Could not draft the proposal", "barberos_audit_draft_proposal", {
    p_prospect: prospect,
    p_run: run,
    p_document: document,
  });
}

export function saveProposal(id: string, document: ProposalDocument): Promise<string> {
  return rpc<string>("Could not save the proposal", "barberos_audit_save_proposal", {
    p_id: id,
    p_document: document,
  });
}

/**
 * Records that WE sent it. It does not send anything: there is no email or SMS
 * provider wired into this platform, so the cockpit must never imply delivery.
 */
export function markProposalSent(id: string): Promise<string> {
  return rpc<string>(
    "Could not mark the proposal as sent",
    "barberos_audit_send_proposal",
    {
      p_id: id,
    },
  );
}

export function decideProposal(
  id: string,
  status: "accepted" | "declined" | "withdrawn",
  note: string,
): Promise<string> {
  return rpc<string>(
    "Could not record the decision",
    "barberos_audit_decide_proposal",
    {
      p_id: id,
      p_status: status,
      p_note: note || null,
    },
  );
}

// ── Onboarding (0056) ──────────────────────────────────────────────────────

export function provisionClient(args: {
  prospect: string;
  slug: string;
  shopName: string;
  chairs: number;
  timezone: string;
}): Promise<string> {
  return rpc<string>("Could not onboard this client", "barberos_provision_client", {
    p_prospect: args.prospect,
    p_slug: args.slug,
    p_shop_name: args.shopName,
    p_chairs: args.chairs,
    p_timezone: args.timezone,
  });
}

// ── Delivery: the shop, its page and its clients (0052 + 0056) ─────────

export interface MyShop {
  tenant_id: string;
  tenant_slug: string;
  shop_name: string;
  chair_count: number;
  timezone: string;
  capabilities: string[];
  site: { slug: string; status: "draft" | "published" } | null;
  /** Computed from the real permission checks, so a hidden button means an absent permission. */
  can: {
    read_shop: boolean;
    edit_page: boolean;
    publish: boolean;
    manage_shop: boolean;
  };
}

export function myShops(): Promise<MyShop[]> {
  return rpc<MyShop[]>("Could not load your shops", "barberos_my_shops");
}

export function saveShop(args: {
  tenant: string;
  shopName: string;
  chairs: number;
  timezone: string;
}): Promise<string> {
  return rpc<string>("Could not save the shop", "barberos_save_shop", {
    p_tenant: args.tenant,
    p_shop_name: args.shopName,
    p_chair_count: args.chairs,
    p_timezone: args.timezone,
  });
}

export interface SiteService {
  name: string;
  price_cents: number | null;
  duration_minutes: number | null;
}
export interface SiteHours {
  day: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
}
export interface Site {
  slug: string;
  status: "draft" | "published";
  shop_name: string | null;
  headline: string | null;
  about: string | null;
  phone: string | null;
  address_line1: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  map_url: string | null;
  booking_url: string | null;
  published_at: string | null;
  hours: SiteHours[];
  services: SiteService[];
  links: { kind: string; url: string }[];
}

/** Null when the shop has no page row yet — not an error, just nothing built. */
export function site(tenant: string): Promise<Site | null> {
  return rpc<Site | null>("Could not load the shop's page", "barberos_site", {
    p_tenant: tenant,
  });
}

export function saveSite(args: {
  tenant: string;
  slug: string;
  headline: string;
  about: string;
  phone: string;
  address: string;
  locality: string;
  region: string;
  postal: string;
  mapUrl: string;
  bookingUrl: string;
}): Promise<string> {
  return rpc<string>("Could not save the page", "barberos_save_site", {
    p_tenant: args.tenant,
    p_slug: args.slug,
    p_headline: args.headline || null,
    p_about: args.about || null,
    p_phone: args.phone || null,
    p_address: args.address || null,
    p_locality: args.locality || null,
    p_region: args.region || null,
    p_postal: args.postal || null,
    p_map_url: args.mapUrl || null,
    p_booking_url: args.bookingUrl || null,
  });
}

export function saveService(args: {
  tenant: string;
  name: string;
  priceCents: number | null;
  minutes: number | null;
  order: number;
}): Promise<number> {
  return rpc<number>("Could not save the service", "barberos_save_service", {
    p_tenant: args.tenant,
    p_name: args.name,
    p_price_cents: args.priceCents,
    p_duration: args.minutes,
    p_order: args.order,
  });
}

export function deleteService(tenant: string, name: string): Promise<boolean> {
  return rpc<boolean>("Could not remove the service", "barberos_delete_service", {
    p_tenant: tenant,
    p_name: name,
  });
}

export function setHours(args: {
  tenant: string;
  day: number;
  closed: boolean;
  opens: string | null;
  closes: string | null;
}): Promise<null> {
  return rpc<null>("Could not save the opening hours", "barberos_set_hours", {
    p_tenant: args.tenant,
    p_day: args.day,
    p_closed: args.closed,
    p_opens: args.opens,
    p_closes: args.closes,
  });
}

/**
 * enforce_publishable() refuses a page with no headline, no address, no way to
 * reach the shop, or no opening hours. The refusal comes back as 23514 with the
 * reason in the message, and the cockpit shows it verbatim.
 */
export function publish(tenant: string): Promise<string> {
  return rpc<string>("Could not publish the page", "barberos_publish", {
    p_tenant: tenant,
  });
}

export function unpublish(tenant: string): Promise<string> {
  return rpc<string>("Could not unpublish the page", "barberos_unpublish", {
    p_tenant: tenant,
  });
}

// ── Client CRM and retention (0052) ──────────────────────────────

export interface ClientRow {
  id: string;
  display_name: string;
  phone: string | null;
  visits: number;
  last_visit: string | null;
}

export function clients(tenant: string, search?: string): Promise<ClientRow[]> {
  return rpc<ClientRow[]>("Could not load clients", "barberos_clients", {
    p_tenant: tenant,
    p_search: search?.trim() ? search.trim() : null,
  });
}

/**
 * client_rhythm() refuses to invent a rhythm from fewer than three visits, and
 * `basis` says which case you are in. overdue_by_days is null (not 0) when
 * there is no rhythm to be overdue against — a 0 there would read as "on time".
 */
export interface ClientRhythm {
  visits: number;
  last_visit: string | null;
  days_since_last: number | null;
  typical_days: number | null;
  basis:
    "never visited" | "not enough visits to know a rhythm" | "average of the last gaps";
  overdue_by_days: number | null;
}

export interface ClientVisit {
  id: number;
  visited_on: string;
  barber: string | null;
  service_name: string | null;
  price_cents: number | null;
  duration_minutes: number | null;
  sides_guard: number | null;
  top_finish: string | null;
  top_guard: number | null;
  fade: string | null;
  beard: string | null;
  beard_guard: number | null;
  line_up: boolean | null;
  part: boolean | null;
  notes: string | null;
  tools: string[];
}

export interface ClientDetail {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  since: string;
  /** Lifetime value AND its own gaps: never show the total without the missing count. */
  value: { total_cents: number; visits: number; visits_without_a_price: number };
  rhythm: ClientRhythm;
  visits: ClientVisit[];
}

export function client(id: string): Promise<ClientDetail | null> {
  return rpc<ClientDetail | null>("Could not load the client", "barberos_client", {
    p_client: id,
  });
}

/** Only clients with a KNOWN rhythm who are past it. Never a fixed interval. */
export interface DueClient {
  id: string;
  display_name: string;
  phone: string | null;
  last_visit: string | null;
  typical_days: number | null;
  overdue_by_days: number;
}

export function clientsDue(tenant: string): Promise<DueClient[]> {
  return rpc<DueClient[]>("Could not load the overdue list", "barberos_clients_due", {
    p_tenant: tenant,
  });
}

export function saveClient(args: {
  tenant: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}): Promise<string> {
  return rpc<string>("Could not save the client", "barberos_save_client", {
    p_tenant: args.tenant,
    p_name: args.name,
    p_phone: args.phone || null,
    p_email: args.email || null,
    p_notes: args.notes || null,
  });
}

export interface VisitInput {
  visited_on: string;
  barber?: string | null;
  service_name?: string | null;
  price_cents?: number | null;
  sides_guard?: number | null;
  top_guard?: number | null;
  top_finish?: string | null;
  fade?: string | null;
  beard?: string | null;
  notes?: string | null;
}

export function recordVisit(
  tenant: string,
  clientId: string,
  visit: VisitInput,
): Promise<string> {
  return rpc<string>("Could not record the visit", "barberos_record_visit", {
    p_tenant: tenant,
    p_client: clientId,
    p_visit: visit,
  });
}

export interface Tool {
  name: string;
  kind: string;
}

export function tools(tenant: string): Promise<Tool[]> {
  return rpc<Tool[]>("Could not load the shop's tools", "barberos_tools", {
    p_tenant: tenant,
  });
}
