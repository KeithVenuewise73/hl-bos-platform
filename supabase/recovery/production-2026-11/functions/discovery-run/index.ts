// HLVS DISCOVERY v4 - FULL 139-QUERY MATRIX, FULLY PAGINATED.
//
// v2: six queries, one page each (silently capped at 100/query).
// v3: six queries, fully paginated.
// v4: all 139 queries across 79 categories + 12 cross-cutting anchors,
//     fully paginated to GitHub's own 1000-result-per-query ceiling.
//
// Nothing is scored, curated, or filtered. Dedupe is by canonical repository
// URL only - enforced twice: within each payload here, and again in
// disco.ingest_github_batch which skips any source_url already present.
//
// 278 GitHub page requests are required. Unauthenticated search allows 10/min,
// so a single invocation CANNOT finish inside the edge wall-clock limit.
// This function therefore processes a time-boxed SLICE of the matrix and then
// self-invokes to continue. One click starts the whole chain.

const MATRIX: Array<{ c: string; p: string; q: string }> = [
  {c:"Video & media processing",p:"POPULAR",q:"topic:video-processing stars:>300 pushed:>2025-06-01"},
  {c:"Scheduling & calendars",p:"POPULAR",q:"topic:scheduling stars:>200 pushed:>2025-06-01"},
  {c:"Sports technology",p:"POPULAR",q:"topic:sports stars:>100 pushed:>2025-06-01"},
  {c:"Automation & workflow",p:"POPULAR",q:"topic:automation stars:>500 pushed:>2025-06-01"},
  {c:"AI models & agents",p:"POPULAR",q:"topic:llm stars:>800 pushed:>2025-06-01"},
  {c:"Analytics & BI",p:"POPULAR",q:"topic:dashboard stars:>800 pushed:>2025-06-01"},
  {c:"Productivity",p:"POPULAR",q:"topic:productivity stars:>200 pushed:>2025-06-01"},
  {c:"Task management",p:"POPULAR",q:"topic:task-manager stars:>100 pushed:>2025-06-01"},
  {c:"Personal organization",p:"POPULAR",q:"topic:personal-knowledge-management stars:>150 pushed:>2025-06-01"},
  {c:"Family organization",p:"POPULAR",q:"\"family organizer\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Calendars",p:"POPULAR",q:"topic:calendar stars:>200 pushed:>2025-06-01"},
  {c:"Reminders",p:"POPULAR",q:"topic:reminder stars:>50 pushed:>2025-06-01"},
  {c:"Habit tracking",p:"POPULAR",q:"topic:habit-tracker stars:>100 pushed:>2025-06-01"},
  {c:"Personal finance",p:"POPULAR",q:"topic:personal-finance stars:>200 pushed:>2025-06-01"},
  {c:"Budgeting",p:"POPULAR",q:"topic:budgeting stars:>80 pushed:>2025-06-01"},
  {c:"Expense tracking",p:"POPULAR",q:"topic:expense-tracker stars:>80 pushed:>2025-06-01"},
  {c:"Subscription tracking",p:"POPULAR",q:"\"subscription tracker\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Accounting",p:"POPULAR",q:"topic:accounting stars:>150 pushed:>2025-06-01"},
  {c:"Bookkeeping",p:"POPULAR",q:"\"bookkeeping\" in:name,description stars:>30 pushed:>2025-06-01"},
  {c:"Invoicing",p:"POPULAR",q:"topic:invoicing stars:>80 pushed:>2025-06-01"},
  {c:"CRM",p:"POPULAR",q:"topic:crm stars:>200 pushed:>2025-06-01"},
  {c:"Sales tools",p:"POPULAR",q:"topic:sales stars:>100 pushed:>2025-06-01"},
  {c:"Lead generation",p:"POPULAR",q:"\"lead generation\" in:name,description stars:>50 pushed:>2025-06-01"},
  {c:"Marketing",p:"POPULAR",q:"topic:marketing stars:>200 pushed:>2025-06-01"},
  {c:"SEO",p:"POPULAR",q:"topic:seo stars:>200 pushed:>2025-06-01"},
  {c:"Social media tools",p:"POPULAR",q:"topic:social-media stars:>200 pushed:>2025-06-01"},
  {c:"Creator tools",p:"POPULAR",q:"topic:content-creation stars:>100 pushed:>2025-06-01"},
  {c:"Customer service",p:"POPULAR",q:"topic:customer-support stars:>100 pushed:>2025-06-01"},
  {c:"Project management",p:"POPULAR",q:"topic:project-management stars:>300 pushed:>2025-06-01"},
  {c:"Team collaboration",p:"POPULAR",q:"topic:collaboration stars:>300 pushed:>2025-06-01"},
  {c:"Communication",p:"POPULAR",q:"topic:communication stars:>200 pushed:>2025-06-01"},
  {c:"Messaging",p:"POPULAR",q:"topic:messaging stars:>300 pushed:>2025-06-01"},
  {c:"Email tools",p:"POPULAR",q:"topic:email stars:>300 pushed:>2025-06-01"},
  {c:"Document tools",p:"POPULAR",q:"topic:document-management stars:>150 pushed:>2025-06-01"},
  {c:"PDF tools",p:"POPULAR",q:"topic:pdf stars:>400 pushed:>2025-06-01"},
  {c:"File management",p:"POPULAR",q:"topic:file-manager stars:>300 pushed:>2025-06-01"},
  {c:"Photo/image tools",p:"POPULAR",q:"topic:image-processing stars:>500 pushed:>2025-06-01"},
  {c:"Video tools",p:"POPULAR",q:"topic:video stars:>500 pushed:>2025-06-01"},
  {c:"Audio tools",p:"POPULAR",q:"topic:audio stars:>400 pushed:>2025-06-01"},
  {c:"Transcription",p:"POPULAR",q:"topic:transcription stars:>150 pushed:>2025-06-01"},
  {c:"Voice/dictation",p:"POPULAR",q:"topic:speech-to-text stars:>300 pushed:>2025-06-01"},
  {c:"Health & wellness",p:"POPULAR",q:"topic:health stars:>200 pushed:>2025-06-01"},
  {c:"Medication management",p:"POPULAR",q:"\"medication\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Sleep",p:"POPULAR",q:"\"sleep tracker\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Fitness",p:"POPULAR",q:"topic:fitness stars:>150 pushed:>2025-06-01"},
  {c:"Nutrition",p:"POPULAR",q:"topic:nutrition stars:>50 pushed:>2025-06-01"},
  {c:"Education",p:"POPULAR",q:"topic:education stars:>400 pushed:>2025-06-01"},
  {c:"Study tools",p:"POPULAR",q:"topic:flashcards stars:>150 pushed:>2025-06-01"},
  {c:"Coaching",p:"POPULAR",q:"\"coaching\" in:name,description stars:>30 pushed:>2025-06-01"},
  {c:"Youth sports",p:"POPULAR",q:"\"youth sports\" OR \"team roster\" in:name,description stars:>10 pushed:>2025-06-01"},
  {c:"Logistics",p:"POPULAR",q:"topic:logistics stars:>80 pushed:>2025-06-01"},
  {c:"Supply chain",p:"POPULAR",q:"topic:supply-chain stars:>50 pushed:>2025-06-01"},
  {c:"Routing",p:"POPULAR",q:"topic:routing stars:>300 pushed:>2025-06-01"},
  {c:"Dispatch",p:"POPULAR",q:"\"dispatch\" in:name,description stars:>50 pushed:>2025-06-01"},
  {c:"Fleet management",p:"POPULAR",q:"\"fleet management\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Transportation",p:"POPULAR",q:"topic:transportation stars:>50 pushed:>2025-06-01"},
  {c:"Delivery",p:"POPULAR",q:"topic:delivery stars:>80 pushed:>2025-06-01"},
  {c:"Inventory",p:"POPULAR",q:"topic:inventory-management stars:>100 pushed:>2025-06-01"},
  {c:"Warehouse",p:"POPULAR",q:"topic:warehouse stars:>30 pushed:>2025-06-01"},
  {c:"Field service",p:"POPULAR",q:"\"field service\" in:name,description stars:>20 pushed:>2025-06-01"},
  {c:"Home services",p:"POPULAR",q:"\"home services\" OR \"handyman\" in:name,description stars:>10 pushed:>2025-06-01"},
  {c:"Construction/trades",p:"POPULAR",q:"topic:construction stars:>50 pushed:>2025-06-01"},
  {c:"Real estate",p:"POPULAR",q:"topic:real-estate stars:>80 pushed:>2025-06-01"},
  {c:"Property management",p:"POPULAR",q:"\"property management\" in:name,description stars:>30 pushed:>2025-06-01"},
  {c:"Restaurant/hospitality",p:"POPULAR",q:"topic:restaurant stars:>50 pushed:>2025-06-01"},
  {c:"HR/workforce",p:"POPULAR",q:"topic:hr stars:>80 pushed:>2025-06-01"},
  {c:"Workforce scheduling",p:"POPULAR",q:"\"shift scheduling\" OR \"employee scheduling\" in:name,description stars:>15 pushed:>2025-06-01"},
  {c:"Legal/compliance",p:"POPULAR",q:"topic:compliance stars:>100 pushed:>2025-06-01"},
  {c:"E-commerce",p:"POPULAR",q:"topic:ecommerce stars:>500 pushed:>2025-06-01"},
  {c:"Small-business operations",p:"POPULAR",q:"topic:small-business stars:>30 pushed:>2025-06-01"},
  {c:"Developer tools",p:"POPULAR",q:"topic:developer-tools stars:>800 pushed:>2025-06-01"},
  {c:"API/integration tools",p:"POPULAR",q:"topic:api stars:>800 pushed:>2025-06-01"},
  {c:"Data management",p:"POPULAR",q:"topic:database stars:>800 pushed:>2025-06-01"},
  {c:"Security/privacy",p:"POPULAR",q:"topic:privacy stars:>400 pushed:>2025-06-01"},
  {c:"Browser extensions",p:"POPULAR",q:"topic:browser-extension stars:>300 pushed:>2025-06-01"},
  {c:"Desktop utilities",p:"POPULAR",q:"topic:desktop-app stars:>300 pushed:>2025-06-01"},
  {c:"Mobile utilities",p:"POPULAR",q:"topic:android OR topic:ios stars:>800 pushed:>2025-06-01"},
  {c:"Self-hosted software",p:"POPULAR",q:"topic:selfhosted stars:>400 pushed:>2025-06-01"},
  {c:"Open-source alternatives",p:"POPULAR",q:"\"open source alternative\" in:description stars:>200 pushed:>2025-06-01"},
  {c:"anchor:productivity",p:"ABANDONED",q:"topic:productivity archived:true stars:>200"},
  {c:"anchor:productivity",p:"UNDERDEVELOPED",q:"topic:productivity stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:productivity",p:"ALTERNATIVES",q:"topic:productivity \"alternative to\" in:description stars:>100"},
  {c:"anchor:productivity",p:"SELF-HOSTED",q:"topic:productivity topic:self-hosted stars:>100"},
  {c:"anchor:productivity",p:"PAIN SIGNALS",q:"topic:productivity stars:>500 pushed:>2026-03-01"},
  {c:"anchor:automation",p:"ABANDONED",q:"topic:automation archived:true stars:>200"},
  {c:"anchor:automation",p:"UNDERDEVELOPED",q:"topic:automation stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:automation",p:"ALTERNATIVES",q:"topic:automation \"alternative to\" in:description stars:>100"},
  {c:"anchor:automation",p:"SELF-HOSTED",q:"topic:automation topic:self-hosted stars:>100"},
  {c:"anchor:automation",p:"PAIN SIGNALS",q:"topic:automation stars:>500 pushed:>2026-03-01"},
  {c:"anchor:selfhosted",p:"ABANDONED",q:"topic:selfhosted archived:true stars:>200"},
  {c:"anchor:selfhosted",p:"UNDERDEVELOPED",q:"topic:selfhosted stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:selfhosted",p:"ALTERNATIVES",q:"topic:selfhosted \"alternative to\" in:description stars:>100"},
  {c:"anchor:selfhosted",p:"SELF-HOSTED",q:"topic:selfhosted topic:self-hosted stars:>100"},
  {c:"anchor:selfhosted",p:"PAIN SIGNALS",q:"topic:selfhosted stars:>500 pushed:>2026-03-01"},
  {c:"anchor:developer-tools",p:"ABANDONED",q:"topic:developer-tools archived:true stars:>200"},
  {c:"anchor:developer-tools",p:"UNDERDEVELOPED",q:"topic:developer-tools stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:developer-tools",p:"ALTERNATIVES",q:"topic:developer-tools \"alternative to\" in:description stars:>100"},
  {c:"anchor:developer-tools",p:"SELF-HOSTED",q:"topic:developer-tools topic:self-hosted stars:>100"},
  {c:"anchor:developer-tools",p:"PAIN SIGNALS",q:"topic:developer-tools stars:>500 pushed:>2026-03-01"},
  {c:"anchor:android",p:"ABANDONED",q:"topic:android archived:true stars:>200"},
  {c:"anchor:android",p:"UNDERDEVELOPED",q:"topic:android stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:android",p:"ALTERNATIVES",q:"topic:android \"alternative to\" in:description stars:>100"},
  {c:"anchor:android",p:"SELF-HOSTED",q:"topic:android topic:self-hosted stars:>100"},
  {c:"anchor:android",p:"PAIN SIGNALS",q:"topic:android stars:>500 pushed:>2026-03-01"},
  {c:"anchor:ios",p:"ABANDONED",q:"topic:ios archived:true stars:>200"},
  {c:"anchor:ios",p:"UNDERDEVELOPED",q:"topic:ios stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:ios",p:"ALTERNATIVES",q:"topic:ios \"alternative to\" in:description stars:>100"},
  {c:"anchor:ios",p:"SELF-HOSTED",q:"topic:ios topic:self-hosted stars:>100"},
  {c:"anchor:ios",p:"PAIN SIGNALS",q:"topic:ios stars:>500 pushed:>2026-03-01"},
  {c:"anchor:dashboard",p:"ABANDONED",q:"topic:dashboard archived:true stars:>200"},
  {c:"anchor:dashboard",p:"UNDERDEVELOPED",q:"topic:dashboard stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:dashboard",p:"ALTERNATIVES",q:"topic:dashboard \"alternative to\" in:description stars:>100"},
  {c:"anchor:dashboard",p:"SELF-HOSTED",q:"topic:dashboard topic:self-hosted stars:>100"},
  {c:"anchor:dashboard",p:"PAIN SIGNALS",q:"topic:dashboard stars:>500 pushed:>2026-03-01"},
  {c:"anchor:crm",p:"ABANDONED",q:"topic:crm archived:true stars:>200"},
  {c:"anchor:crm",p:"UNDERDEVELOPED",q:"topic:crm stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:crm",p:"ALTERNATIVES",q:"topic:crm \"alternative to\" in:description stars:>100"},
  {c:"anchor:crm",p:"SELF-HOSTED",q:"topic:crm topic:self-hosted stars:>100"},
  {c:"anchor:crm",p:"PAIN SIGNALS",q:"topic:crm stars:>500 pushed:>2026-03-01"},
  {c:"anchor:calendar",p:"ABANDONED",q:"topic:calendar archived:true stars:>200"},
  {c:"anchor:calendar",p:"UNDERDEVELOPED",q:"topic:calendar stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:calendar",p:"ALTERNATIVES",q:"topic:calendar \"alternative to\" in:description stars:>100"},
  {c:"anchor:calendar",p:"SELF-HOSTED",q:"topic:calendar topic:self-hosted stars:>100"},
  {c:"anchor:calendar",p:"PAIN SIGNALS",q:"topic:calendar stars:>500 pushed:>2026-03-01"},
  {c:"anchor:health",p:"ABANDONED",q:"topic:health archived:true stars:>200"},
  {c:"anchor:health",p:"UNDERDEVELOPED",q:"topic:health stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:health",p:"ALTERNATIVES",q:"topic:health \"alternative to\" in:description stars:>100"},
  {c:"anchor:health",p:"SELF-HOSTED",q:"topic:health topic:self-hosted stars:>100"},
  {c:"anchor:health",p:"PAIN SIGNALS",q:"topic:health stars:>500 pushed:>2026-03-01"},
  {c:"anchor:finance",p:"ABANDONED",q:"topic:finance archived:true stars:>200"},
  {c:"anchor:finance",p:"UNDERDEVELOPED",q:"topic:finance stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:finance",p:"ALTERNATIVES",q:"topic:finance \"alternative to\" in:description stars:>100"},
  {c:"anchor:finance",p:"SELF-HOSTED",q:"topic:finance topic:self-hosted stars:>100"},
  {c:"anchor:finance",p:"PAIN SIGNALS",q:"topic:finance stars:>500 pushed:>2026-03-01"},
  {c:"anchor:education",p:"ABANDONED",q:"topic:education archived:true stars:>200"},
  {c:"anchor:education",p:"UNDERDEVELOPED",q:"topic:education stars:200..2000 pushed:>2026-01-01"},
  {c:"anchor:education",p:"ALTERNATIVES",q:"topic:education \"alternative to\" in:description stars:>100"},
  {c:"anchor:education",p:"SELF-HOSTED",q:"topic:education topic:self-hosted stars:>100"},
  {c:"anchor:education",p:"PAIN SIGNALS",q:"topic:education stars:>500 pushed:>2026-03-01"}
];

const TENANT = "<REDACTED:uuid_literal_named_tenant:70595455ea9b>";
const RUN_KEY = "<REDACTED:hardcoded_key_literal:78e147b06346>";

const PER_PAGE = 100;
const MAX_PAGES = 10;                 // GitHub hard cap: 1000 results per query
const HARD_CAP = PER_PAGE * MAX_PAGES;
const SLICE_BUDGET_MS = 170000;       // stop and chain well inside wall clock

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function canon(u: string): string {
  let s = (u ?? "").trim().replace(/\/+$/, "");
  if (s.toLowerCase().endsWith(".git")) s = s.slice(0, -4);
  return s.toLowerCase();
}

async function ghPage(q: string, page: number, token?: string) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`
            + `&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "hlvs-discovery",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers });
    if (r.ok) {
      const body = await r.json();
      const rem = Number(r.headers.get("x-ratelimit-remaining") ?? "1");
      const rst = Number(r.headers.get("x-ratelimit-reset") ?? "0");
      if (rem <= 0 && rst) {
        await sleep(Math.min(Math.max(0, rst * 1000 - Date.now()) + 2000, 70000));
      }
      return { body, error: null as string | null };
    }
    if (r.status === 422) return { body: null, error: "422 unsupported syntax / beyond result window" };
    if (r.status === 403 || r.status === 429) {
      const ra = r.headers.get("retry-after");
      const rst = Number(r.headers.get("x-ratelimit-reset") ?? "0");
      let wait = 30000;
      if (ra) wait = (Number(ra) + 2) * 1000;
      else if (rst) wait = Math.max(0, rst * 1000 - Date.now()) + 2000;
      await sleep(Math.min(wait, 70000));
      continue;
    }
    if (r.status >= 500) { await sleep(5000); continue; }
    return { body: null, error: `HTTP ${r.status}` };
  }
  return { body: null, error: "exhausted retries" };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== RUN_KEY) {
    return new Response(JSON.stringify({ error: "missing or invalid key" }, null, 2), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ghToken = Deno.env.get("GITHUB_TOKEN") ?? undefined;
  const H = {
    "Content-Type": "application/json", apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`, "Content-Profile": "disco",
  };

  const start = Number(url.searchParams.get("start") ?? "0");
  let runId = url.searchParams.get("run");

  // STATUS MODE: ?status=1&run=<id>
  if (url.searchParams.get("status") === "1" && runId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/discovery_runs?id=eq.${runId}&select=*`, { headers: H });
    return new Response(await r.text(), { headers: { "content-type": "application/json" } });
  }

  // Open the run on the first slice.
  if (!runId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/discovery_runs`, {
      method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id: TENANT,
        method: "GitHub Search API - 79 categories / 139 queries, fully paginated",
        queries: [], raw_results: 0, deduped_results: 0, filtered_out: 0,
      }),
    });
    const row = await res.json().catch(() => null);
    runId = Array.isArray(row) ? row[0]?.id : row?.id;
  }

  const t0 = Date.now();
  const sliceLog: Array<Record<string, unknown>> = [];
  let sliceRaw = 0, sliceCreated = 0;
  let i = start;

  for (; i < MATRIX.length; i++) {
    if (Date.now() - t0 > SLICE_BUDGET_MS) break;
    const m = MATRIX[i];

    const first = await ghPage(m.q, 1, ghToken);
    if (!first.body) {
      sliceLog.push({ i, category: m.c, pattern: m.p, query: m.q, available: 0,
                      retrieved: 0, pages: 0, hard_limited: false, unreachable: 0,
                      error: first.error });
      continue;
    }
    const available: number = first.body.total_count ?? 0;
    const collected: any[] = [...(first.body.items ?? [])];
    const reachable = Math.min(available, HARD_CAP);
    const pagesNeeded = available ? Math.min(Math.ceil(reachable / PER_PAGE), MAX_PAGES) : 1;
    let pagesDone = 1, perr: string | null = null;

    for (let page = 2; page <= pagesNeeded; page++) {
      const nx = await ghPage(m.q, page, ghToken);
      if (!nx.body) { perr = nx.error; break; }
      const got = nx.body.items ?? [];
      collected.push(...got);
      pagesDone++;
      if (got.length === 0) break;
    }

    // Dedupe within this query's payload by canonical URL; DB dedupes globally.
    const seen = new Map<string, Record<string, unknown>>();
    for (const r of collected) {
      const k = canon(r.html_url);
      if (k && !seen.has(k)) {
        seen.set(k, {
          source: "GitHub", source_area: m.c, source_query: m.q,
          name: r.full_name, url: r.html_url, description: r.description,
          stars: r.stargazers_count, forks: r.forks_count,
          open_issues: r.open_issues_count, language: r.language,
          topics: r.topics ?? [], pushed_at: r.pushed_at,
          license: r.license?.spdx_id ?? null, archived: r.archived ?? false,
        });
      }
    }
    const rows = [...seen.values()];
    sliceRaw += collected.length;

    for (let b = 0; b < rows.length; b += 50) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_github_batch`, {
        method: "POST", headers: H,
        body: JSON.stringify({ p_run: runId, p_tenant: TENANT, p_rows: rows.slice(b, b + 50) }),
      });
      if (res.ok) sliceCreated += Number(await res.text()) || 0;
    }

    sliceLog.push({ i, category: m.c, pattern: m.p, query: m.q, available,
                    retrieved: collected.length, pages: pagesDone,
                    hard_limited: available > HARD_CAP,
                    unreachable: Math.max(0, available - HARD_CAP), error: perr });
  }

  // Merge this slice's telemetry into the run row.
  const cur = await (await fetch(
    `${SUPABASE_URL}/rest/v1/discovery_runs?id=eq.${runId}&select=queries,raw_results,deduped_results,opportunities_created`,
    { headers: H })).json().catch(() => [{}]);
  const prev = Array.isArray(cur) ? cur[0] ?? {} : {};
  const mergedQueries = [...(prev.queries ?? []), ...sliceLog];
  const done = i >= MATRIX.length;

  await fetch(`${SUPABASE_URL}/rest/v1/discovery_runs?id=eq.${runId}`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      queries: mergedQueries,
      raw_results: (prev.raw_results ?? 0) + sliceRaw,
      deduped_results: (prev.opportunities_created ?? 0) + sliceCreated,
      opportunities_created: (prev.opportunities_created ?? 0) + sliceCreated,
      filtered_out: 0,
      ...(done ? {
        finished_at: new Date().toISOString(),
        summary: `139-query paginated pass complete across 79 categories; ${mergedQueries.length} queries executed; filtered out 0.`,
      } : {}),
    }),
  });

  // Chain the next slice. Fire-and-forget: the request is sent, we do not wait.
  if (!done) {
    const next = `${url.origin}${url.pathname}?key=${RUN_KEY}&run=${runId}&start=${i}`;
    try {
      await fetch(next, { signal: AbortSignal.timeout(3000) });
    } catch (_) { /* expected - downstream invocation continues independently */ }
  }

  return new Response(JSON.stringify({
    run_id: runId,
    matrix: { categories: 79, queries: MATRIX.length },
    slice: { from: start, to: i, queries_done: i - start },
    complete: done,
    progress: `${i}/${MATRIX.length}`,
    github_token_present: Boolean(ghToken),
    raw_this_slice: sliceRaw,
    created_this_slice: sliceCreated,
    filtered_out_before_display: 0,
    status_url: `${url.origin}${url.pathname}?key=${RUN_KEY}&status=1&run=${runId}`,
  }, null, 2), { headers: { "content-type": "application/json" } });
});
