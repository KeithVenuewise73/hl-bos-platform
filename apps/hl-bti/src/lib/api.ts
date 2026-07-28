"use client";

import { analyst, type consulting } from "@hl-bos/bti-engine";
import { getSupabase } from "./supabase";

// ── Types mirroring the public.bti_* RPC surface (migration 0027) ──────────

export interface TenantRef {
  tenant_id: string;
  name: string;
  slug: string;
  can_manage: boolean;
}

export interface BusinessRow {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  industry_pack: string | null;
  location: string | null;
  primary_contact: string | null;
  email: string | null;
  phone: string | null;
  goals: string | null;
  analysis_only: boolean;
  created_at: string;
  latest: {
    id: string;
    produced_at: string;
    transformation_score: number | null;
  } | null;
}

export interface IntakeInput {
  tenant: string;
  name: string;
  website: string;
  industry: string;
  pack: string;
  location: string;
  primaryContact: string;
  email: string;
  phone: string;
  goals: string;
  analysisOnly: boolean;
}

// The persisted, self-contained view of an analysis. Storing this (not the raw
// engine object) means a saved business re-renders identically on any device,
// with no re-run required.
export interface FindingView {
  label: string;
  finding: string;
  priority: string;
  confidence: string;
  roi: "High" | "Medium" | "Low";
  evidence: string[];
  businessImpact: string;
  businessRisk: string;
  rootCause: string;
  recommendedAction: string;
  timeline: string;
  difficulty: string;
  services: string[];
}

export interface AnalysisView {
  version: 1;
  businessName: string;
  transformationScore: number | null;
  profile: { label: string; detail: string; evidence: string }[];
  coverageNote: string;
  findings: FindingView[];
  narrative: { title: string; body: string }[];
  recommendedServices: string[];
  proposal: { service: string; type: "recurring" | "one_time"; addresses: string[] }[];
}

function rpcError(context: string, message: string): Error {
  return new Error(`${context}: ${message}`);
}

// ── Auth-context RPC wrappers ──────────────────────────────────────────────

export async function fetchMyTenants(): Promise<TenantRef[]> {
  const res = await getSupabase().rpc("bti_my_tenants");
  if (res.error) throw rpcError("Could not load your workspaces", res.error.message);
  return (res.data as TenantRef[] | null) ?? [];
}

export async function listBusinesses(tenant: string): Promise<BusinessRow[]> {
  const res = await getSupabase().rpc("bti_list_businesses", { p_tenant: tenant });
  if (res.error) throw rpcError("Could not load businesses", res.error.message);
  return (res.data as BusinessRow[] | null) ?? [];
}

export async function registerBusiness(input: IntakeInput): Promise<string> {
  const res = await getSupabase().rpc("bti_register_business", {
    p_tenant: input.tenant,
    p_name: input.name,
    p_website: input.website,
    p_industry: input.industry || null,
    p_pack: input.pack || null,
    p_location: input.location,
    p_primary_contact: input.primaryContact,
    p_email: input.email || null,
    p_phone: input.phone,
    p_goals: input.goals,
    p_analysis_only: input.analysisOnly,
  });
  if (res.error) throw rpcError("Could not create the business", res.error.message);
  return res.data as string;
}

export async function saveAnalysis(
  businessId: string,
  view: AnalysisView,
): Promise<string> {
  const res = await getSupabase().rpc("bti_save_analysis", {
    p_business: businessId,
    p_transformation_score: view.transformationScore,
    p_payload: view,
  });
  if (res.error) throw rpcError("Could not save the analysis", res.error.message);
  return res.data as string;
}

export async function fetchLatestAnalysis(
  businessId: string,
): Promise<AnalysisView | null> {
  const res = await getSupabase().rpc("bti_latest_analysis", {
    p_business: businessId,
  });
  if (res.error) throw rpcError("Could not load the saved analysis", res.error.message);
  return (res.data as AnalysisView | null) ?? null;
}

// ── Engine orchestration → the persistable view ────────────────────────────

function roiBand(priority: string): "High" | "Medium" | "Low" {
  if (priority === "critical" || priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

/** Run the real engine on a business + its site HTML, then normalize to a view. */
export function runAnalysis(args: {
  name: string;
  website: string;
  industry: string;
  location: string;
  html: string;
}): AnalysisView {
  const analysis = analyst.analyzeBusiness({
    name: args.name.trim(),
    website: args.website.trim(),
    industry: args.industry,
    html: args.html,
    ...(args.location.trim() ? { location: args.location.trim() } : {}),
  });
  return toView(analysis);
}

type EngineAnalysis = ReturnType<typeof analyst.analyzeBusiness>;

function toView(a: EngineAnalysis): AnalysisView {
  const report = a.report;
  const findings: FindingView[] = report.findings.map(
    (f: consulting.Finding, i: number) => ({
      label: f.label,
      finding: f.finding,
      priority: f.priority,
      confidence: report.review[i]?.confidence ?? "moderate",
      roi: roiBand(f.priority),
      evidence: f.supportingEvidence,
      businessImpact: f.businessImpact,
      businessRisk: f.businessRisk,
      rootCause: f.rootCause,
      recommendedAction: f.recommendedAction,
      timeline: f.timeline,
      difficulty: f.difficulty,
      services: f.services,
    }),
  );

  const uniqueServices: string[] = [];
  for (const s of a.proposal.recommendedServices) {
    if (!uniqueServices.includes(s)) uniqueServices.push(s);
  }

  return {
    version: 1,
    businessName: a.business.name,
    transformationScore: report.transformationScore,
    profile: a.profile.map((o) => ({
      label: o.label,
      detail: o.detail,
      evidence: o.evidence,
    })),
    coverageNote: a.coverageNote,
    findings,
    narrative: report.narrative
      .filter((s) => s.hasData)
      .map((s) => ({ title: s.title, body: s.body })),
    recommendedServices: uniqueServices,
    proposal: a.proposal.lines.map((l) => ({
      service: l.service,
      type: l.type,
      addresses: l.supportedBy.slice(0, 3),
    })),
  };
}

/** The demo site HTML shipped with the engine — pre-fills the analysis field. */
export const SAMPLE_HTML: string = analyst.SAMPLE_HTML;
export const SAMPLE_BUSINESS = analyst.SAMPLE_BUSINESS;
