// Website scan orchestrator (deterministic core; AI optional and non-blocking).
//
// Validates the target and EVERY redirect hop for SSRF, enforces size/redirect/
// content-type limits, extracts deterministic findings, scores them via the
// rubric, then OPTIONALLY runs fenced AI analysis. AI failure never invalidates
// deterministic findings — the scan completes 'partially_completed'. Network
// I/O is injected (`fetchPage`, `resolve`) so this is deterministic and offline
// in tests; production supplies a real fetch adapter that re-validates at
// connect time.

import {
  normalizeUrl,
  resolveAndValidate,
  SsrfError,
  validateRedirect,
  validateUrl,
} from "./url.ts";
import { extractFindings } from "./extract.ts";
import { RUBRIC_VERSION, scoreFromFindings } from "./rubric.ts";
import { buildAnalysisRequest } from "./injection.ts";
import { redact } from "../ai/redact.ts";

export interface FetchResult {
  status: number;
  finalUrl: string;
  redirectChain: string[]; // each hop's target URL, in order
  headers: Record<string, string>;
  body: string;
  bytes: number;
  contentType: string;
}

export interface ScanLimits {
  maxRedirects: number;
  maxBytes: number;
  allowedContentTypes: string[];
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxRedirects: 5,
  maxBytes: 5_000_000,
  allowedContentTypes: ["text/html"],
};

export interface ScanResult {
  status: "completed" | "partially_completed" | "failed";
  normalizedUrl: string;
  error?: string;
  stats: {
    pagesFetched: number;
    redirectCount: number;
    bytes: number;
    findingsCount: number;
  };
  findings: ReturnType<typeof scoreFromFindings>["findings"];
  dimensions: ReturnType<typeof scoreFromFindings>["dimensions"];
  rubricVersion: string;
  aiFindings: unknown | null;
  aiError?: string;
}

export interface RunScanParams {
  rawUrl: string;
  resolve: (host: string) => Promise<string[]>;
  fetchPage: (url: string) => Promise<FetchResult>;
  analyze?: (req: ReturnType<typeof buildAnalysisRequest>) => Promise<unknown>;
  limits?: Partial<ScanLimits>;
}

function fail(normalizedUrl: string, error: string): ScanResult {
  return {
    status: "failed",
    normalizedUrl,
    error,
    stats: { pagesFetched: 0, redirectCount: 0, bytes: 0, findingsCount: 0 },
    findings: [],
    dimensions: [],
    rubricVersion: RUBRIC_VERSION,
    aiFindings: null,
  };
}

export async function runScan(params: RunScanParams): Promise<ScanResult> {
  const limits = { ...DEFAULT_LIMITS, ...(params.limits ?? {}) };
  let normalized = params.rawUrl;
  try {
    // 1. structural + IP-literal validation, then DNS-resolved validation
    const url = validateUrl(params.rawUrl);
    normalized = normalizeUrl(url.toString());
    await resolveAndValidate(url.hostname, params.resolve);
  } catch (e) {
    if (e instanceof SsrfError) return fail(normalized, e.message);
    return fail(normalized, `validation_error:${redact(String(e))}`);
  }

  let res: FetchResult;
  try {
    res = await params.fetchPage(normalized);
  } catch (e) {
    return fail(normalized, `fetch_error:${redact(String(e))}`);
  }

  // 2. validate every redirect hop independently (+ its resolved IPs)
  try {
    if (res.redirectChain.length > limits.maxRedirects)
      return fail(normalized, "ssrf_blocked:too_many_redirects");
    for (const hop of res.redirectChain) {
      const u = validateRedirect(hop, normalized);
      await resolveAndValidate(u.hostname, params.resolve);
    }
  } catch (e) {
    if (e instanceof SsrfError) return fail(normalized, e.message);
    return fail(normalized, `redirect_error:${redact(String(e))}`);
  }

  // 3. response guards
  if (res.bytes > limits.maxBytes)
    return fail(normalized, "ssrf_blocked:response_too_large");
  const ct = (res.contentType || "").split(";")[0].trim().toLowerCase();
  if (!limits.allowedContentTypes.includes(ct))
    return fail(normalized, `unsupported_content_type:${ct}`);
  if (res.status >= 400) return fail(normalized, `http_${res.status}`);

  // 4. deterministic extraction + rubric scoring
  const findingsObj = extractFindings(res.body, res.headers, res.finalUrl);
  const scored = scoreFromFindings(findingsObj);
  const stats = {
    pagesFetched: 1,
    redirectCount: res.redirectChain.length,
    bytes: res.bytes,
    findingsCount: scored.findings.length,
  };

  // 5. optional AI analysis — fenced, structured, and NON-BLOCKING
  let aiFindings: unknown | null = null;
  let aiError: string | undefined;
  if (params.analyze) {
    try {
      const req = buildAnalysisRequest({
        systemInstructions: "You assess a business website. Output JSON only.",
        rubric: "Return { findings: [{ label, evidenceRef, confidence }] }.",
        untrustedContent:
          (findingsObj.title ?? "") +
          "\n" +
          res.body.replace(/<[^>]*>/g, " ").slice(0, 8000),
      });
      aiFindings = await params.analyze(req);
    } catch (e) {
      aiError = redact(String(e));
    }
  }

  return {
    status: aiError ? "partially_completed" : "completed",
    normalizedUrl: normalized,
    stats,
    findings: scored.findings,
    dimensions: scored.dimensions,
    rubricVersion: scored.rubricVersion,
    aiFindings,
    aiError,
  };
}
