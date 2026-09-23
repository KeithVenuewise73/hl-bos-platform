/**
 * THE ENTERPRISE APPLICATION REGISTRY.
 *
 * Every Herman Legacy application — platform apps, executive tooling, vertical
 * products, external web properties, government systems, and the legacy estate —
 * is recorded here with its operational facts: repository, branch, environment,
 * deployment status, URLs, Supabase project, version, health, dependencies,
 * reusable modules, Software Factory integration, and executive owner.
 *
 * Governance rule (Phase IX): an application must never exist outside this
 * registry. The `assertAppsRegistered` reconciliation proves every workspace app
 * has a record; the Recovery Report (Phase IX docs) is the evidence base for the
 * external and legacy entries.
 *
 * HONESTY (Principle 10): URLs, deployment status and health are RECORDED from
 * verifiable evidence, never asserted. A value we could not verify is `null` with
 * a stated reason — we do not invent a production URL, a health status, or a
 * deployment that did not happen. `deploymentStatus: "unknown"` means exactly
 * that: not reachable from the tools available at inventory time.
 */

export type AppCategory =
  | "platform"
  | "executive_tooling"
  | "vertical_product"
  | "web_property"
  | "government"
  | "legacy";

export type DevStatus =
  "live" | "built_undeployed" | "prototype" | "planned" | "legacy" | "external";

export type DeployStatus = "deployed" | "not_deployed" | "external_hosted" | "unknown";

export type AppHealth = "green" | "yellow" | "red" | "unknown";

export type AppEnvironment = "production" | "staging" | "local" | "none" | "unknown";

export interface ApplicationRecord {
  key: string;
  name: string;
  description: string;
  category: AppCategory;
  /** owner/repo, or a note when there is no accessible repository. */
  repository: string;
  /** GitHub owner / hosting org. */
  owner: string;
  /** The business owner accountable for the application. */
  executiveOwner: string;
  /** Default or active working branch. */
  currentBranch: string;
  environment: AppEnvironment;
  developmentStatus: DevStatus;
  deploymentStatus: DeployStatus;
  productionUrl: string | null;
  stagingUrl: string | null;
  localUrl: string | null;
  /** Supabase project ref, or null when the app uses none / is unknown. */
  supabaseProject: string | null;
  version: string | null;
  health: AppHealth;
  hosting: string;
  dependencies: string[];
  /** Reusable @hl-bos/catalog module keys this app is (or would be) built from. */
  reusableModules: string[];
  softwareFactoryIntegration: string;
  notes: string;
  evidence: string;
}

const CORE = "mvvtngiopdrgiedjmhfb"; // HL-BOS Core (verified via Supabase org)
const REPO = "KeithVenuewise73/hl-bos-platform";

/**
 * The registry. Monorepo apps are verified from the workspace; external and
 * legacy entries are from the Phase IX Enterprise Asset Recovery inventory
 * (GitHub repo metadata + verified CNAMEs + Supabase org listing).
 */
export const APPLICATIONS: ApplicationRecord[] = [
  // ======================================================================
  // PLATFORM
  // ======================================================================
  {
    key: "hl-bos",
    name: "HL-BOS (Business Operating System)",
    description:
      "The shared multi-tenant platform every product is assembled from — 27 migrations, 124 tables, 17 schemas, 100% RLS. The spine, not a deployed app.",
    category: "platform",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "main",
    environment: "production",
    developmentStatus: "live",
    deploymentStatus: "deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: CORE,
    version: "27 migrations",
    health: "green",
    hosting: "Supabase (HL-BOS Core, us-west-2)",
    dependencies: ["Supabase Postgres 17"],
    reusableModules: ["identity_core", "events_bus", "workflows", "entitlements"],
    softwareFactoryIntegration: "Provides the shared spine the Factory assembles onto.",
    notes:
      "Database platform is live; the edge runtime is not yet deployed (CEO/ops gate).",
    evidence: "Supabase org 'Herman Legacy Software Ventures'; migrations 0001-0027",
  },

  // ======================================================================
  // EXECUTIVE TOOLING
  // ======================================================================
  {
    key: "executive-portal",
    name: "Herman Legacy Executive Portal",
    description:
      "Secure, read-only, cloud-deployable executive operating system over the Enterprise Catalog, Software Factory and intelligence engines. The CEO's daily interface.",
    category: "executive_tooling",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "feat/herman-legacy-executive-portal",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4300",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet (Coolify configured, not deployed)",
    dependencies: [
      "@hl-bos/catalog",
      "@hl-bos/transformation-intelligence",
      "@supabase/ssr",
    ],
    reusableModules: ["identity_core"],
    softwareFactoryIntegration:
      "Consumes @hl-bos/catalog (Factory) + @hl-bos/transformation-intelligence read-only.",
    notes:
      "Deploy workflow has never run (0 runs). Staging deployment awaits CEO Coolify authorization.",
    evidence: "apps/executive-portal; GitHub Actions deploy.yml run count = 0",
  },
  {
    key: "herman-legacy-digital",
    name: "Herman Legacy Digital",
    description:
      "The customer-facing AI-powered Business Transformation company (hermanlegacydigital.com): a public marketing + assessment-intake site and an authenticated client portal. Assembled on HL-BOS — reuses the portfolio, VisibilityAI, HL-BTI, customer lifecycle, HL-BOS identity and the Executive Portal deployment pattern; introduces no duplicate identity/CRM/workflow/portal systems.",
    category: "web_property",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/hlvs-architectural-assessment-ltqs1b",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4400",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet (Coolify pattern configured, not deployed)",
    dependencies: [
      "@hl-bos/catalog",
      "@hl-bos/transformation-intelligence",
      "@supabase/ssr",
    ],
    reusableModules: ["identity_core"],
    softwareFactoryIntegration:
      "Public projection + client portal over @hl-bos/catalog (portfolio) and @hl-bos/transformation-intelligence (customer lifecycle, reference implementations).",
    notes:
      "Release 1 built and validated (build + tests green); not deployed. DNS to hermanlegacydigital.com awaits CEO authorization.",
    evidence: "apps/herman-legacy-digital (Phase 6, Release 1); not deployed",
  },
  {
    key: "hscs-website",
    name: "HSCS Marketing Website",
    description:
      "The public HSCS marketing site (Herman Supply Chain Solutions — Transportation & Operations Consulting), implementing the approved HSCS Commercial Launch Phase 1 Baseline (docs/products/hscs-*). Milestone 2A delivers the application foundation, the Design System tokens in code, the shared header/nav/footer, and the homepage only — no assessment intake, no Supabase, no analytics.",
    category: "web_property",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Herman Supply Chain Solutions",
    currentBranch: "claude/hscs-website-homepage-v1",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4600",
    supabaseProject: null,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet (not deployed)",
    dependencies: ["Next.js 16", "React 19"],
    reusableModules: [],
    softwareFactoryIntegration:
      "None — public marketing site rendering the approved Phase 1 Baseline copy and design; not assembled from Factory modules.",
    notes:
      "Milestone 2A (application foundation + homepage) only: Design System tokens in code, shared header/responsive nav/footer, homepage sections S1–S11, plus honest /request-an-assessment and /coming-soon pages (no fake form, no fabricated success). Remaining service/industry pages and the assessment intake are intentionally not built. Local format/lint/typecheck/test/build green; not deployed.",
    evidence:
      "apps/hscs-website; Milestone 2A implementation PR; local build + tests green; not deployed",
  },
  {
    key: "venture-studio",
    name: "Herman Legacy Venture Studio (HLVS V2)",
    description:
      "Internal, authenticated executive opportunity-intelligence app: capture opportunity → evidence → evaluate → deterministic HL-BOS reuse analysis → advisory recommendation → authoritative CEO decision → read-only Factory readiness. Assembled on HL-BOS — reuses @hl-bos/catalog and @hl-bos/venture-studio, HL-BOS identity, and the Executive Portal deployment pattern. V2-1: no external connectors; no duplicate identity/CRM/workflow systems.",
    category: "executive_tooling",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/hlvs-v2-foundation",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4500",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet (Coolify pattern configured, not deployed)",
    dependencies: ["@hl-bos/catalog", "@hl-bos/venture-studio", "@supabase/ssr"],
    reusableModules: ["identity_core"],
    softwareFactoryIntegration:
      "Reads the hlvs Software Factory for readiness preview only; V2-1 creates no Factory work. Reuse analysis computed over @hl-bos/catalog.",
    notes:
      "V2-1 foundation: app + @hl-bos/venture-studio package + vstudio migration 0029 (applied to production) + pgTAP. B1 CEO Notebook adds notebook entries over vstudio.notes (migration 0030, UNAPPLIED pending CEO approval). App tests + build green; pgTAP CI-verified.",
    evidence:
      "apps/venture-studio (HLVS V2); migration 0029 applied to production; 0030 (CEO Notebook) written UNAPPLIED; not deployed",
  },
  {
    key: "highlightai-football",
    name: "HighlightAI Football",
    description:
      "Upload a football game, name an athlete by jersey colour and number, and get back the plays he was in and a highlight reel of them. A player detection, tracking, play-segmentation and highlight-generation platform aimed at youth and high-school film (Hudl exports, Veo, press box, end zone, phone). Assembled on HL-BOS: reuses identity, tenancy, permissions, audit, events and storage metadata; adds the `highlight` schema and the @hl-bos/highlight-football engine.",
    category: "vertical_product",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/highlightai-football-build-n1sz9s",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    // 4601, not 4600: the ATS Resume Optimizer already answers on 4600, and two
    // local apps that cannot run at the same time is a defect the Control Center
    // would surface as "not running" with no explanation.
    localUrl: "http://localhost:4601",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet (web on Vercel/Coolify; GPU worker needs a separate CUDA host)",
    dependencies: ["@hl-bos/highlight-football", "next", "react"],
    reusableModules: ["identity_core"],
    softwareFactoryIntegration:
      "None. Built directly on the HL-BOS spine; creates no Factory work.",
    notes:
      "RUNS IN DEMO MODE. The football intelligence engine (269 tests), the `highlight` schema (migration 0049, 66 pgTAP assertions), the 14 screens plus an AI debug view (38 tests) and the Python CV worker (77 tests) are built and green locally. No computer-vision model is installed or trained, no real game film has been processed, and migration 0049 has not been applied to any Supabase project. Every screen carries a non-dismissible banner saying the football is synthetic; there is deliberately no fallback from live mode to demo mode.",
    evidence:
      "packages/highlight-football, apps/highlightai-football, services/highlight-cv, supabase/migrations 0049 + supabase/tests/49; local build, lint, typecheck and tests green; not deployed",
  },
  {
    key: "ats-resume-optimizer",
    name: "ATS Resume Optimizer",
    description:
      "Compares a job posting against a master resume, matches every requirement to real evidence from the candidate's own material, scores the fit on an internal model, and generates a tailored ATS-friendly resume in which every sentence is traceable to a source fact. The product principle is enforced in code, not in a prompt: optimize aggressively, fabricate nothing.",
    category: "executive_tooling",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/ats-resume-optimizer-dc3nh3",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4600",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet",
    dependencies: ["@hl-bos/ats-resume"],
    reusableModules: [],
    softwareFactoryIntegration:
      "None. The engine (@hl-bos/ats-resume) is a standalone capability package with no platform dependencies, so it can be reused by any future product without pulling in identity or tenancy.",
    notes:
      "Storage is a local JSON file; the PostgreSQL schema (migration 0048, ats) is written and verified against a local PostgreSQL 16 but is UNAPPLIED to any project, and the Supabase-backed store is not built. The app says so on its Settings page. Claude is optional: with no API key the built-in rules engine runs every feature. 76 unit tests plus an end-to-end verification against the running app.",
    evidence:
      "apps/ats-resume-optimizer + packages/ats-resume; migration 0048 written UNAPPLIED; verified by running the app (generate, edit, validate, export)",
  },
  {
    key: "sceneflow",
    name: "SceneFlow",
    description:
      "Direct a scene, or plan a story, from your own photographs: cast, focus pair, interaction, intimacy ceiling, reciprocal affection, setting, wardrobe and mood, with the prompt composed on the server from the structured choices and never accepted from the browser. Deliberately a SEPARATE APP from the Development Control Center: the console can run git, pnpm and PowerShell and therefore may only ever listen on localhost, while this carries no command surface beyond the local image worker and can be opened from a phone on the home network behind an access code.",
    category: "executive_tooling",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/sceneflow-ai-mvp-rcshk4",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4100",
    // Deliberately null: migration 0050 is written and unapplied, and this app
    // stores nothing outside the machine it runs on.
    supabaseProject: null,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet",
    dependencies: ["@hl-bos/sceneflow"],
    reusableModules: [],
    softwareFactoryIntegration:
      "None. The engine (@hl-bos/sceneflow) is a standalone capability package with no platform dependencies; this app is its interface and stores nothing outside the operator's own machine.",
    notes:
      "PRIVATE TOOL, not a product for sale — that scope is what makes the open-weight model licences usable. It composes the instruction and produces NO IMAGE: no image model is connected. Access is guarded by a code in .sceneflow/access-code.txt, enforced in Node middleware so a locked request is never rendered at all; the first version of that gate lived in the layout and leaked the page in the response payload, which is why there is a verification script that reads the served bytes. Photographs stay under .sceneflow/, which is gitignored. Guessing the code is throttled (three free attempts, then doubling to a thirty-second ceiling, the right code refused mid-wait), because a code with unlimited guesses is not a lock once the app is reachable from outside the house. Away-from-home access is over Tailscale, detected by reading the machine's own 100.64.0.0/10 address rather than running anything; it is deliberately NOT a public web address.",
    evidence:
      "apps/sceneflow + packages/sceneflow; 16/16 access checks and 16/16 director checks against the running app (scripts/local-test/verify-sceneflow-access.cjs, verify-sceneflow-director.cjs); no model checkpoint has ever been loaded",
  },
  {
    key: "dispatchos-match",
    name: "DispatchOS Match",
    description:
      "Backhaul load matching for small carriers: filters every truck/load pair on hard constraints (equipment vs commodity, weight and cubic yards, deadhead, service radius, pickup and delivery windows) and ranks what survives by projected contribution and revenue per mile, with an adjustable, visible formula and a plain reason for every load it turns down. Dedicated-lane equipment is reported, never ranked.",
    category: "vertical_product",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "claude/dispatchos-match-backhaul-fyxbrc",
    environment: "local",
    developmentStatus: "prototype",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4700",
    // Deliberately null: no schema exists; nothing is stored anywhere.
    supabaseProject: null,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet",
    dependencies: ["@hl-bos/dispatch-match"],
    reusableModules: [],
    softwareFactoryIntegration:
      "None. The engine (@hl-bos/dispatch-match) is a standalone, tenant-scoped, equipment-agnostic capability package with no platform dependencies, so another fleet is new data, not new code.",
    notes:
      "Runs on SAMPLE data only (an illustrative Western NY bulk fleet with invented loads and rates). Road miles are estimated (great-circle x 1.2) because no routing API is connected; no load board is connected; nothing is saved (CSV-imported loads last for the browser tab). No return-load probability is shown anywhere, because there is no recorded lane history to base one on.",
    evidence:
      "apps/dispatchos-match + packages/dispatch-match; 39 engine tests + 3 app tests; tenant guard verified by removal (its test fails); 12/12 checks in a real browser; started from the Control Center's Start button and answered /api/health",
  },
  {
    key: "control-center",
    name: "CEO Development Control Center",
    description:
      "The permanent, localhost-only executive console (build/test/merge/approve without a terminal). Deliberately NOT internet-exposed — it shells out to git/pnpm.",
    category: "executive_tooling",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "main",
    environment: "local",
    developmentStatus: "live",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "scripts\\control-center.bat (local)",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "green",
    hosting: "localhost only (by design — never exposed)",
    dependencies: ["@hl-bos/catalog", "git", "pnpm"],
    reusableModules: [],
    softwareFactoryIntegration: "Surfaces the Catalog + Factory governance to the CEO.",
    notes: "Must remain local-only; has a command surface and no auth.",
    evidence: "apps/control-center; CLAUDE.md operating contract",
  },

  // ======================================================================
  // VERTICAL PRODUCTS (HL-BOS)
  // ======================================================================
  {
    key: "hl-bti",
    name: "HL-BTI App",
    description:
      "Authenticated cloud-persistent BTI front end — a thin RLS-trusting client over the public bti_* RPCs. The reference shape for future product UIs.",
    category: "vertical_product",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "HSCS Consulting",
    currentBranch: "main",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4200",
    supabaseProject: CORE,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet",
    dependencies: ["@hl-bos/bti-engine", "@supabase/supabase-js"],
    reusableModules: ["bti_platform", "scoring_engine", "discovery_engine"],
    softwareFactoryIntegration: "Product assembled from the bti_platform composition.",
    notes: "Static export; talks to public.bti_* RPCs with the anon key.",
    evidence: "apps/hl-bti; migration 0027 public API",
  },
  {
    key: "hl-bti-alpha",
    name: "HL-BTI Alpha (demo)",
    description:
      "Offline, browser-storage demo of the same deterministic engine. Maps 1:1 to future bti.* RPCs; shares @hl-bos/bti-engine so the math cannot drift.",
    category: "vertical_product",
    repository: REPO,
    owner: "KeithVenuewise73",
    executiveOwner: "HSCS Consulting",
    currentBranch: "main",
    environment: "local",
    developmentStatus: "built_undeployed",
    deploymentStatus: "not_deployed",
    productionUrl: null,
    stagingUrl: null,
    localUrl: "http://localhost:4100",
    supabaseProject: null,
    version: "0.1.0",
    health: "unknown",
    hosting: "none yet",
    dependencies: ["@hl-bos/bti-engine"],
    reusableModules: ["bti_platform", "scoring_engine"],
    softwareFactoryIntegration: "Demonstrates the bti_platform composition offline.",
    notes: "localStorage only; no backend.",
    evidence: "apps/hl-bti-alpha",
  },

  // ======================================================================
  // GOVERNMENT
  // ======================================================================
  {
    key: "hscs-glp",
    name: "HSCS Government Logistics Platform (HSCS-GLP)",
    description:
      "AI-powered Government Logistics Intelligence & Contract Management Platform for Herman Supply Chain Solutions. The real-world counterpart to the Government Intelligence module.",
    category: "government",
    repository: "KeithVenuewise73/HSCS-GLP (private)",
    owner: "KeithVenuewise73",
    executiveOwner: "Herman Supply Chain Solutions",
    currentBranch: "main",
    environment: "unknown",
    developmentStatus: "prototype",
    deploymentStatus: "unknown",
    productionUrl: null,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "unknown (private repo; hosting not connected to this session)",
    dependencies: ["(not inventoried — private repo not in session scope)"],
    reusableModules: [],
    softwareFactoryIntegration:
      "Candidate to converge onto HL-BOS Government Intelligence; not yet governed by the Factory.",
    notes:
      "Private repo, last pushed 2026-07-24. Deployment, URLs and env require CEO to grant access.",
    evidence: "GitHub repo metadata (KeithVenuewise73/HSCS-GLP)",
  },

  // ======================================================================
  // EXTERNAL WEB PROPERTIES (GitHub Pages / Vercel)
  // ======================================================================
  webProperty(
    "hermanlegacygroup",
    "Herman Legacy Group (site)",
    "hermanlegacygroup",
    "hermanlegacygroup.com",
    "The Herman Legacy Group corporate site.",
    "Keith Herman (CEO)",
  ),
  webProperty(
    "hermanlegacyfoundation",
    "Herman Legacy Foundation (site)",
    "hermanlegacyfoundation",
    "hermanlegacyfoundation.org",
    "The Herman Legacy Foundation site.",
    "Keith Herman (CEO)",
  ),
  webProperty(
    "ddhhomeservices",
    "DDH Home Services (site)",
    "ddhhomeservices.com",
    "ddhhomeservices.com",
    "DDH Home Services marketing site.",
    "DDH Home Services",
  ),
  webProperty(
    "homehuddle",
    "HomeHuddle (site)",
    "homehuddle",
    "venuewise.net",
    "HomeHuddle — 'powered by Venuewise'. CNAME resolves to venuewise.net.",
    "Herman Legacy Software Ventures",
  ),
  webProperty(
    "5starsportsmedia",
    "5 Star Sports Media (site)",
    "5star-sports-media",
    "5starsportsmedia.com",
    "5 Star Sports Media site.",
    "5 Star Sports Media",
  ),
  webProperty(
    "5starcommunityevents",
    "5 Star Community Events (site)",
    "5starcommunityevents",
    "5starcommunityevents.com",
    "5 Star Community Events site.",
    "5 Star",
  ),
  webProperty(
    "laurieandlew",
    "Laurie & Lew Community Network (site)",
    "laurieandlewcommunitynetwork",
    "laurieandlewcommunitynetwork.org",
    "Laurie & Lew Community Network site.",
    "Laurie & Lew Community Network",
  ),
  {
    key: "5stargrowthsolutions",
    name: "5 Star Growth Solutions (site)",
    description: "5 Star Growth Solutions marketing site (GitHub Pages).",
    category: "web_property",
    repository: "KeithVenuewise73/5stargrowthsolutions",
    owner: "KeithVenuewise73",
    executiveOwner: "5 Star Growth Solutions",
    currentBranch: "main",
    environment: "production",
    developmentStatus: "external",
    deploymentStatus: "external_hosted",
    productionUrl: null,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "GitHub Pages",
    dependencies: [],
    reusableModules: [],
    softwareFactoryIntegration: "None — static site, outside the Factory.",
    notes:
      "GitHub Pages enabled; custom domain (CNAME) not captured at inventory time — verify the exact URL with the CEO.",
    evidence: "GitHub repo metadata (has_pages=true); CNAME unread",
  },
  {
    key: "herman-supply-chain",
    name: "Herman Supply Chain (site)",
    description: "Herman Supply Chain public site (GitHub Pages).",
    category: "web_property",
    repository: "KeithVenuewise73/herman-supply-chain",
    owner: "KeithVenuewise73",
    executiveOwner: "Herman Supply Chain Solutions",
    currentBranch: "main",
    environment: "production",
    developmentStatus: "external",
    deploymentStatus: "external_hosted",
    productionUrl: null,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "GitHub Pages",
    dependencies: [],
    reusableModules: [],
    softwareFactoryIntegration: "None — static site, outside the Factory.",
    notes:
      "GitHub Pages enabled; custom domain (CNAME) not captured at inventory time — verify the exact URL with the CEO.",
    evidence: "GitHub repo metadata (has_pages=true); CNAME unread",
  },
  {
    key: "coaches-huddle-chrismazzu",
    name: "CoachesHuddle — Chris Mazzu (Vercel)",
    description:
      "CoachesHuddle for Chris Mazzu Hockey Clinics — 'powered by Venuewise'. Public registration, schedule sync, family notifications.",
    category: "web_property",
    repository: "KeithVenuewise73/coaches-huddle-chrismazzu",
    owner: "KeithVenuewise73",
    executiveOwner: "Herman Legacy Software Ventures (Venuewise)",
    currentBranch: "main",
    environment: "production",
    developmentStatus: "external",
    deploymentStatus: "deployed",
    productionUrl: "https://coaches-huddle-chrismazzu.vercel.app",
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "Vercel",
    dependencies: ["Venuewise platform"],
    reusableModules: [],
    softwareFactoryIntegration:
      "A live Venuewise-powered vertical — a convergence candidate for HL-BOS.",
    notes: "Live Vercel deployment per GitHub-reported homepage.",
    evidence: "GitHub repo homepage: coaches-huddle-chrismazzu.vercel.app",
  },

  // ======================================================================
  // LEGACY — the original HLVS Venture Studio
  // ======================================================================
  {
    key: "hlvs-venture-studio",
    name: "HLVS Venture Studio (original / legacy)",
    description:
      "The original Herman Legacy Venture Studio. Recovery result: NOT found as an accessible GitHub repository. It survives only as a legacy Supabase project that is unreachable from current credentials.",
    category: "legacy",
    repository: "not found (no accessible repository)",
    owner: "Herman Legacy (legacy)",
    executiveOwner: "Keith Herman (CEO)",
    currentBranch: "unknown",
    environment: "unknown",
    developmentStatus: "legacy",
    deploymentStatus: "unknown",
    productionUrl: null,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "unknown (legacy Supabase project not in the accessible org)",
    dependencies: [],
    reusableModules: [],
    softwareFactoryIntegration:
      "Its correct patterns were generalized into HL-BOS (hlvs schema, migration 0025); the legacy estate is out of scope.",
    notes:
      "Legacy project ref bkfsjhhclbqrhaolvhmz is NOT listed under the accessible Supabase org — unreachable and out of scope with open security findings. Do not touch without an approved plan.",
    evidence:
      "Supabase org listing (legacy ref absent); docs/architecture/current-state-audit.md; registry.ts prod.hlvs-venture-studio",
  },
];

function webProperty(
  key: string,
  name: string,
  repo: string,
  domain: string,
  description: string,
  executiveOwner: string,
): ApplicationRecord {
  return {
    key,
    name,
    description,
    category: "web_property",
    repository: `KeithVenuewise73/${repo}`,
    owner: "KeithVenuewise73",
    executiveOwner,
    currentBranch: "main",
    environment: "production",
    developmentStatus: "external",
    deploymentStatus: "external_hosted",
    productionUrl: `https://${domain}`,
    stagingUrl: null,
    localUrl: null,
    supabaseProject: null,
    version: null,
    health: "unknown",
    hosting: "GitHub Pages",
    dependencies: [],
    reusableModules: [],
    softwareFactoryIntegration: "None — static site, outside the Factory.",
    notes: "GitHub Pages enabled; custom domain verified from the repo CNAME.",
    evidence: `GitHub repo metadata (has_pages=true); CNAME=${domain}`,
  };
}

export function applicationByKey(key: string): ApplicationRecord | undefined {
  return APPLICATIONS.find((a) => a.key === key);
}

export function applicationsByCategory(category: AppCategory): ApplicationRecord[] {
  return APPLICATIONS.filter((a) => a.category === category);
}

export interface RegistryReconciliation {
  ok: boolean;
  /** Workspace app directory names with no registry record — the governance gap. */
  unregistered: string[];
}

/**
 * Governance: prove every workspace app directory has a registry record. The
 * registry `key` must match the `apps/<key>` directory name for monorepo apps.
 */
export function reconcileWorkspaceApps(appDirs: string[]): RegistryReconciliation {
  const keys = new Set(APPLICATIONS.map((a) => a.key));
  const unregistered = appDirs.filter((d) => !keys.has(d));
  return { ok: unregistered.length === 0, unregistered };
}
