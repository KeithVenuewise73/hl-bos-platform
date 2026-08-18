/**
 * HLVS wide-net discovery matrix — GitHub.
 *
 * This file IS the discovery definition. Every category, every pattern, every
 * threshold, the pagination rules, the dedupe key and the source name live
 * here, in source control, so a run is reproducible and auditable. Nothing
 * about a run may be improvised at execution time.
 *
 * HISTORY: the original 79-category / 139-query matrix was never committed —
 * it existed only in a sandbox and was lost with it, along with its 12,200
 * results. This replacement is deliberately wider and is committed BEFORE it
 * is ever executed.
 *
 * DESIGN RULES
 *   * Cast wide. Coverage beats precision: a weak-looking repository is still
 *     the CEO's to dismiss, never the engine's.
 *   * NEVER filter, rank or score before CEO review. This module produces
 *     queries only — it has no opinion about what comes back.
 *   * Dates are absolute, not relative to "today", so re-running the matrix a
 *     month from now searches the same window and the corpus stays comparable.
 *   * GitHub does not support OR between `topic:` qualifiers — `topic:android
 *     OR topic:ios` returns HTTP 422. Multi-platform interests are therefore
 *     separate categories, never an OR.
 */

/** The anchor date for every relative-looking threshold below. */
export const MATRIX_VERSION = "2026-08-18" as const;

/** Where these findings come from. Written to `vstudio.opportunities.source_type`. */
export const DISCOVERY_SOURCE = "github" as const;

/**
 * The one deduplication key. Two findings are the same opportunity when their
 * canonical repository URLs match, case-insensitively — nothing else is
 * considered, and no near-duplicate heuristic is applied.
 */
export const DEDUPE_KEY = "repository_url" as const;

/** How far a single query is paged before GitHub's own ceiling stops it. */
export const PAGINATION = {
  perPage: 100,
  /** GitHub Search returns at most 1,000 results per query, whatever the total. */
  maxResultsPerQuery: 1000,
  get maxPagesPerQuery(): number {
    return this.maxResultsPerQuery / this.perPage;
  },
  /** Authenticated GitHub Search allows 30 requests/minute. */
  requestsPerMinute: 30,
  /**
   * A query whose total_count exceeds maxResultsPerQuery is HARD-LIMITED: the
   * run records that fact per query and keeps every result it could obtain.
   * It never silently truncates.
   */
  recordHardLimited: true,
} as const;

export const SEARCH_PATTERNS = [
  "POPULAR",
  "UNDERDEVELOPED",
  "ABANDONED",
  "PAIN SIGNALS",
  "SELF-HOSTED",
  "ALTERNATIVES",
] as const;

export type SearchPattern = (typeof SEARCH_PATTERNS)[number];

/**
 * The qualifier fragment each pattern contributes, appended to a category's
 * own qualifier. Thresholds are stated here once so every category inherits
 * exactly the same definition of "popular" or "abandoned".
 */
export const PATTERN_QUALIFIERS: Record<SearchPattern, string> = {
  /** Proven demand: a large audience, still maintained. */
  POPULAR: "stars:>500 pushed:>2025-08-18",
  /** Real but small: traction exists, the software is thin. */
  UNDERDEVELOPED: "stars:20..400 pushed:>2025-08-18",
  /** An audience left stranded: once popular, untouched for two years. */
  ABANDONED: "stars:>300 pushed:<2024-08-18",
  /** Maintainer strain and unmet demand, expressed as open calls for help. */
  "PAIN SIGNALS": "help-wanted-issues:>5",
  /** People self-hosting rather than buying — an unserved commercial market. */
  "SELF-HOSTED": "topic:self-hosted",
  /** Explicit dissatisfaction with an incumbent. */
  ALTERNATIVES: '"alternative to" in:readme',
};

export interface DiscoveryCategory {
  /** Stable key, written to `vstudio.opportunities.category`. */
  key: string;
  /** Human label for the catalog's category filter. */
  label: string;
  /** The GitHub qualifier that scopes this category. */
  qualifier: string;
  /** Which patterns are searched for this category. */
  patterns: readonly SearchPattern[];
}

const BROAD = ["POPULAR", "UNDERDEVELOPED"] as const satisfies readonly SearchPattern[];

/**
 * The category library. Every category is searched with at least POPULAR and
 * UNDERDEVELOPED; the extra patterns are added where that lens plausibly
 * surfaces a distinct opportunity (abandonment in mature tooling, self-hosting
 * where a paid incumbent dominates, and so on).
 *
 * The six categories carried over from the original matrix are marked
 * ORIGINAL — they were named explicitly by the CEO and must not be dropped.
 */
export const DISCOVERY_CATEGORIES: readonly DiscoveryCategory[] = [
  // --- Media, creation and entertainment ------------------------------------
  // ORIGINAL: Video & media processing
  {
    key: "video-media-processing",
    label: "Video & media processing",
    qualifier: "topic:video",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED", "PAIN SIGNALS"],
  },
  {
    key: "media-streaming",
    label: "Media streaming",
    qualifier: "topic:streaming",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "photography",
    label: "Photography & image editing",
    qualifier: "topic:photography",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "audio-music",
    label: "Audio & music",
    qualifier: "topic:audio",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "podcasting",
    label: "Podcasting",
    qualifier: "topic:podcast",
    patterns: [...BROAD],
  },
  {
    key: "graphic-design",
    label: "Graphic design tools",
    qualifier: "topic:design",
    patterns: [...BROAD],
  },
  {
    key: "3d-graphics",
    label: "3D & graphics",
    qualifier: "topic:3d",
    patterns: [...BROAD],
  },
  {
    key: "game-development",
    label: "Game development",
    qualifier: "topic:game-development",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "digital-publishing",
    label: "Digital publishing & ebooks",
    qualifier: "topic:ebook",
    patterns: [...BROAD],
  },

  // --- Scheduling, time and personal productivity ---------------------------
  // ORIGINAL: Scheduling & calendars
  {
    key: "scheduling-calendars",
    label: "Scheduling & calendars",
    qualifier: "topic:calendar",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED", "ALTERNATIVES", "PAIN SIGNALS"],
  },
  {
    key: "booking-appointments",
    label: "Booking & appointments",
    qualifier: "topic:booking",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "task-management",
    label: "Task management",
    qualifier: "topic:task-manager",
    patterns: [...BROAD, "ALTERNATIVES"],
  },
  {
    key: "project-management",
    label: "Project management",
    qualifier: "topic:project-management",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "time-tracking",
    label: "Time tracking",
    qualifier: "topic:time-tracking",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "note-taking",
    label: "Note taking",
    qualifier: "topic:note-taking",
    patterns: [...BROAD, "ALTERNATIVES"],
  },
  {
    key: "knowledge-management",
    label: "Personal knowledge management",
    qualifier: "topic:knowledge-management",
    patterns: [...BROAD],
  },
  {
    key: "habit-tracking",
    label: "Habit & goal tracking",
    qualifier: "topic:habit-tracker",
    patterns: [...BROAD],
  },
  {
    key: "document-collaboration",
    label: "Document collaboration",
    qualifier: "topic:collaboration",
    patterns: [...BROAD, "SELF-HOSTED"],
  },

  // --- Sports ---------------------------------------------------------------
  // ORIGINAL: Sports technology
  {
    key: "sports-technology",
    label: "Sports technology",
    qualifier: "topic:sports",
    patterns: [...BROAD, "ABANDONED", "PAIN SIGNALS"],
  },
  {
    key: "sports-analytics",
    label: "Sports analytics",
    qualifier: "topic:sports-analytics",
    patterns: [...BROAD],
  },
  {
    key: "esports",
    label: "Esports",
    qualifier: "topic:esports",
    patterns: [...BROAD],
  },
  {
    key: "fitness",
    label: "Fitness & training",
    qualifier: "topic:fitness",
    patterns: [...BROAD, "ABANDONED"],
  },

  // --- Automation and workflow ----------------------------------------------
  // ORIGINAL: Automation & workflow
  {
    key: "automation-workflow",
    label: "Automation & workflow",
    qualifier: "topic:automation",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED", "ALTERNATIVES", "PAIN SIGNALS"],
  },
  {
    key: "workflow-engine",
    label: "Workflow engines",
    qualifier: "topic:workflow-engine",
    patterns: [...BROAD],
  },
  {
    key: "rpa",
    label: "Robotic process automation",
    qualifier: "topic:rpa",
    patterns: [...BROAD],
  },
  {
    key: "no-code",
    label: "No-code & low-code",
    qualifier: "topic:no-code",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "integration-ipaas",
    label: "Integration & iPaaS",
    qualifier: "topic:integration",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "web-scraping",
    label: "Web scraping & extraction",
    qualifier: "topic:web-scraping",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "job-scheduling",
    label: "Job scheduling",
    qualifier: "topic:scheduler",
    patterns: [...BROAD],
  },
  {
    key: "etl-pipelines",
    label: "ETL & data pipelines",
    qualifier: "topic:etl",
    patterns: [...BROAD],
  },

  // --- AI, ML and data ------------------------------------------------------
  // ORIGINAL: AI models & agents
  {
    key: "ai-models-agents",
    label: "AI models & agents",
    qualifier: "topic:llm",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED", "ALTERNATIVES", "PAIN SIGNALS"],
  },
  {
    key: "ai-agents",
    label: "Autonomous agents",
    qualifier: "topic:ai-agents",
    patterns: [...BROAD, "PAIN SIGNALS"],
  },
  {
    key: "machine-learning",
    label: "Machine learning",
    qualifier: "topic:machine-learning",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "computer-vision",
    label: "Computer vision",
    qualifier: "topic:computer-vision",
    patterns: [...BROAD],
  },
  {
    key: "nlp",
    label: "Natural language processing",
    qualifier: "topic:nlp",
    patterns: [...BROAD],
  },
  {
    key: "speech",
    label: "Speech & voice",
    qualifier: "topic:speech-recognition",
    patterns: [...BROAD],
  },
  {
    key: "recommender-systems",
    label: "Recommendation systems",
    qualifier: "topic:recommender-system",
    patterns: [...BROAD],
  },
  {
    key: "vector-search",
    label: "Vector search & embeddings",
    qualifier: "topic:vector-database",
    patterns: [...BROAD],
  },
  { key: "mlops", label: "MLOps", qualifier: "topic:mlops", patterns: [...BROAD] },
  // ORIGINAL: Analytics & BI
  {
    key: "analytics-bi",
    label: "Analytics & BI",
    qualifier: "topic:analytics",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED", "ALTERNATIVES", "PAIN SIGNALS"],
  },
  {
    key: "business-intelligence",
    label: "Business intelligence",
    qualifier: "topic:business-intelligence",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "data-visualization",
    label: "Data visualization",
    qualifier: "topic:data-visualization",
    patterns: [...BROAD],
  },
  {
    key: "data-engineering",
    label: "Data engineering",
    qualifier: "topic:data-engineering",
    patterns: [...BROAD],
  },

  // --- B2B and SaaS ---------------------------------------------------------
  {
    key: "crm",
    label: "CRM",
    qualifier: "topic:crm",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "erp",
    label: "ERP",
    qualifier: "topic:erp",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "hr-recruiting",
    label: "HR & recruiting",
    qualifier: "topic:hr",
    patterns: [...BROAD],
  },
  {
    key: "payroll",
    label: "Payroll",
    qualifier: "topic:payroll",
    patterns: [...BROAD],
  },
  {
    key: "accounting",
    label: "Accounting",
    qualifier: "topic:accounting",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "invoicing-billing",
    label: "Invoicing & billing",
    qualifier: "topic:invoicing",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "ecommerce",
    label: "E-commerce",
    qualifier: "topic:ecommerce",
    patterns: [...BROAD, "ABANDONED", "SELF-HOSTED"],
  },
  {
    key: "point-of-sale",
    label: "Point of sale & retail",
    qualifier: "topic:point-of-sale",
    patterns: [...BROAD],
  },
  {
    key: "inventory",
    label: "Inventory management",
    qualifier: "topic:inventory-management",
    patterns: [...BROAD],
  },
  {
    key: "marketing-automation",
    label: "Marketing automation",
    qualifier: "topic:marketing-automation",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "email-marketing",
    label: "Email marketing",
    qualifier: "topic:email-marketing",
    patterns: [...BROAD],
  },
  {
    key: "customer-support",
    label: "Customer support & helpdesk",
    qualifier: "topic:helpdesk",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "chat-messaging",
    label: "Chat & messaging",
    qualifier: "topic:chat",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "saas-platforms",
    label: "SaaS platforms & boilerplates",
    qualifier: "topic:saas",
    patterns: [...BROAD],
  },
  {
    key: "subscription-billing",
    label: "Subscriptions & payments",
    qualifier: "topic:payments",
    patterns: [...BROAD],
  },

  // --- Industry software ----------------------------------------------------
  {
    key: "healthcare",
    label: "Healthcare",
    qualifier: "topic:healthcare",
    patterns: [...BROAD, "ABANDONED", "PAIN SIGNALS"],
  },
  {
    key: "medical-records",
    label: "Medical records & EHR",
    qualifier: "topic:ehr",
    patterns: [...BROAD],
  },
  {
    key: "mental-health",
    label: "Mental health",
    qualifier: "topic:mental-health",
    patterns: [...BROAD],
  },
  {
    key: "legal-tech",
    label: "Legal technology",
    qualifier: "topic:legaltech",
    patterns: [...BROAD],
  },
  {
    key: "real-estate",
    label: "Real estate",
    qualifier: "topic:real-estate",
    patterns: [...BROAD],
  },
  {
    key: "construction",
    label: "Construction",
    qualifier: "topic:construction",
    patterns: [...BROAD],
  },
  {
    key: "logistics",
    label: "Logistics & supply chain",
    qualifier: "topic:logistics",
    patterns: [...BROAD, "PAIN SIGNALS"],
  },
  {
    key: "fleet-management",
    label: "Fleet & transport",
    qualifier: "topic:fleet-management",
    patterns: [...BROAD],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    qualifier: "topic:manufacturing",
    patterns: [...BROAD],
  },
  {
    key: "agriculture",
    label: "Agriculture",
    qualifier: "topic:agriculture",
    patterns: [...BROAD],
  },
  {
    key: "energy-utilities",
    label: "Energy & utilities",
    qualifier: "topic:energy",
    patterns: [...BROAD],
  },
  {
    key: "insurance",
    label: "Insurance",
    qualifier: "topic:insurance",
    patterns: [...BROAD],
  },
  {
    key: "fintech",
    label: "Fintech & banking",
    qualifier: "topic:fintech",
    patterns: [...BROAD, "PAIN SIGNALS"],
  },
  {
    key: "personal-finance",
    label: "Personal finance",
    qualifier: "topic:personal-finance",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "civic-tech",
    label: "Government & civic",
    qualifier: "topic:civic-tech",
    patterns: [...BROAD],
  },
  {
    key: "nonprofit",
    label: "Nonprofit & social impact",
    qualifier: "topic:nonprofit",
    patterns: [...BROAD],
  },
  {
    key: "hospitality",
    label: "Hospitality & restaurants",
    qualifier: "topic:restaurant",
    patterns: [...BROAD],
  },
  {
    key: "events-ticketing",
    label: "Events & ticketing",
    qualifier: "topic:events",
    patterns: [...BROAD],
  },
  {
    key: "education",
    label: "Education & LMS",
    qualifier: "topic:education",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "language-learning",
    label: "Language learning",
    qualifier: "topic:language-learning",
    patterns: [...BROAD],
  },
  { key: "travel", label: "Travel", qualifier: "topic:travel", patterns: [...BROAD] },
  {
    key: "recipes-food",
    label: "Recipes & food",
    qualifier: "topic:recipes",
    patterns: [...BROAD],
  },
  {
    key: "nutrition",
    label: "Nutrition",
    qualifier: "topic:nutrition",
    patterns: [...BROAD],
  },
  {
    key: "parenting",
    label: "Parenting & family",
    qualifier: "topic:parenting",
    patterns: [...BROAD],
  },

  // --- Platforms: mobile, desktop, web --------------------------------------
  // NOTE: android and ios are DELIBERATELY separate categories. GitHub rejects
  // `topic:android OR topic:ios` with HTTP 422.
  {
    key: "mobile-android",
    label: "Mobile — Android",
    qualifier: "topic:android",
    patterns: [...BROAD, "ABANDONED", "PAIN SIGNALS"],
  },
  {
    key: "mobile-ios",
    label: "Mobile — iOS",
    qualifier: "topic:ios",
    patterns: [...BROAD, "ABANDONED", "PAIN SIGNALS"],
  },
  {
    key: "mobile-flutter",
    label: "Mobile — Flutter",
    qualifier: "topic:flutter",
    patterns: [...BROAD],
  },
  {
    key: "mobile-react-native",
    label: "Mobile — React Native",
    qualifier: "topic:react-native",
    patterns: [...BROAD],
  },
  {
    key: "desktop-apps",
    label: "Desktop applications",
    qualifier: "topic:electron",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "browser-extensions",
    label: "Browser extensions",
    qualifier: "topic:browser-extension",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "pwa",
    label: "Progressive web apps",
    qualifier: "topic:pwa",
    patterns: [...BROAD],
  },
  {
    key: "cms",
    label: "Content management",
    qualifier: "topic:cms",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "static-site-generators",
    label: "Static site generators",
    qualifier: "topic:static-site-generator",
    patterns: [...BROAD, "ABANDONED"],
  },

  // --- Developer, infrastructure and security -------------------------------
  {
    key: "developer-tools",
    label: "Developer tools",
    qualifier: "topic:developer-tools",
    patterns: [...BROAD, "ABANDONED", "PAIN SIGNALS"],
  },
  {
    key: "devops-cicd",
    label: "DevOps & CI/CD",
    qualifier: "topic:devops",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "monitoring",
    label: "Monitoring & observability",
    qualifier: "topic:monitoring",
    patterns: [...BROAD, "SELF-HOSTED", "ALTERNATIVES"],
  },
  {
    key: "security-tools",
    label: "Security tooling",
    qualifier: "topic:security",
    patterns: [...BROAD, "PAIN SIGNALS"],
  },
  {
    key: "privacy-tools",
    label: "Privacy tooling",
    qualifier: "topic:privacy",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "databases",
    label: "Databases",
    qualifier: "topic:database",
    patterns: [...BROAD],
  },
  {
    key: "api-tools",
    label: "API tooling",
    qualifier: "topic:api",
    patterns: [...BROAD],
  },
  {
    key: "testing-qa",
    label: "Testing & QA",
    qualifier: "topic:testing",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "documentation",
    label: "Documentation tooling",
    qualifier: "topic:documentation",
    patterns: [...BROAD],
  },
  {
    key: "backup-sync",
    label: "Backup & sync",
    qualifier: "topic:backup",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "file-sharing",
    label: "File sharing & storage",
    qualifier: "topic:file-sharing",
    patterns: [...BROAD, "SELF-HOSTED"],
  },
  {
    key: "home-automation",
    label: "Home automation",
    qualifier: "topic:home-automation",
    patterns: [...BROAD, "SELF-HOSTED"],
  },

  // --- Emerging technology --------------------------------------------------
  {
    key: "blockchain-web3",
    label: "Blockchain & web3",
    qualifier: "topic:blockchain",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "iot",
    label: "IoT & connected devices",
    qualifier: "topic:iot",
    patterns: [...BROAD, "ABANDONED"],
  },
  {
    key: "robotics",
    label: "Robotics",
    qualifier: "topic:robotics",
    patterns: [...BROAD],
  },
  {
    key: "ar-vr",
    label: "AR & VR",
    qualifier: "topic:augmented-reality",
    patterns: [...BROAD],
  },
  {
    key: "quantum-computing",
    label: "Quantum computing",
    qualifier: "topic:quantum-computing",
    patterns: [...BROAD],
  },
  {
    key: "edge-computing",
    label: "Edge computing",
    qualifier: "topic:edge-computing",
    patterns: [...BROAD],
  },
  {
    key: "digital-accessibility",
    label: "Accessibility",
    qualifier: "topic:accessibility",
    patterns: [...BROAD],
  },
  {
    key: "localization",
    label: "Localization & i18n",
    qualifier: "topic:i18n",
    patterns: [...BROAD],
  },
];

export interface DiscoveryQuery {
  /** Stable identifier: `<category key>::<pattern>`. */
  id: string;
  categoryKey: string;
  categoryLabel: string;
  pattern: SearchPattern;
  /** The exact string sent to GitHub, stored on every row it produces. */
  query: string;
}

/**
 * Expand the category library into the full query list, deterministically.
 * Order is stable: categories in declaration order, patterns in
 * SEARCH_PATTERNS order.
 */
export function buildDiscoveryQueries(): DiscoveryQuery[] {
  const out: DiscoveryQuery[] = [];
  for (const category of DISCOVERY_CATEGORIES) {
    for (const pattern of SEARCH_PATTERNS) {
      if (!category.patterns.includes(pattern)) continue;
      out.push({
        id: `${category.key}::${pattern}`,
        categoryKey: category.key,
        categoryLabel: category.label,
        pattern,
        query: `${category.qualifier} ${PATTERN_QUALIFIERS[pattern]}`,
      });
    }
  }
  return out;
}

/** The full matrix, expanded once. */
export const DISCOVERY_QUERIES: readonly DiscoveryQuery[] = buildDiscoveryQueries();
