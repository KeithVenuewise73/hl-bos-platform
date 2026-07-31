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
