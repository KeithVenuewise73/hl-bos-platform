// Inspecting a SAVED copy of a homepage, for when the live site cannot be
// reached (this console is often offline) or for a business whose site source
// HLG holds itself (HLG's own companies keep their sites in GitHub).
//
// The page still goes through the existing safe scanner and the same
// detectors -- only the bytes come from the saved copy instead of the network,
// and nothing is ever fetched. Every website finding then says, in its own
// evidence, that it describes the saved copy and where that copy came from, so
// no one reads it as a live check.

import type { FetchResult } from "../../../supabase/functions/_shared/discovery/scan.ts";
import type { Finding, Prospect } from "./types.ts";
import type { WebEgress } from "./website.ts";

export interface SavedPage {
  /** The address the page lives at (what the business's website is). */
  url: string;
  html: string;
  /** Where the copy came from, in words: "GitHub hermanlegacygroup @ 57ee5b9". */
  source: string;
  /** When the copy was taken, ISO date. */
  savedAt: string;
}

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * An egress that serves only the saved page and never touches the network.
 * Any other address is reported as not resolvable, exactly as an unknown host.
 */
export function savedPageEgress(page: SavedPage): WebEgress {
  const want = new URL(page.url);
  const sameUrl = (u: string) => {
    try {
      const x = new URL(u);
      return (
        x.host === want.host && (x.pathname === want.pathname || x.pathname === "/")
      );
    } catch {
      return false;
    }
  };
  return {
    online: () => Promise.resolve(true),
    // Any public address satisfies the safe scanner's address checks. No
    // connection is made to it: fetchPage below never goes to the network.
    resolve: (host) =>
      host === want.hostname
        ? Promise.resolve(["93.184.216.34"])
        : Promise.reject(new Error(`getaddrinfo ENOTFOUND ${host}`)),
    fetchPage: (u): Promise<FetchResult> => {
      if (!sameUrl(u)) return Promise.reject(new Error("not in the saved copy"));
      const body = page.html.slice(0, MAX_BYTES);
      return Promise.resolve({
        status: 200,
        finalUrl: page.url,
        redirectChain: [],
        headers: { "content-type": "text/html; charset=utf-8" },
        body,
        bytes: new TextEncoder().encode(body).length,
        contentType: "text/html",
      });
    },
    fetchRobots: () => Promise.resolve(undefined),
  };
}

/** Re-label website findings so each one says it came from the saved copy. */
export function markSavedCopy(findings: Finding[], page: SavedPage): Finding[] {
  const tag = `Saved copy of ${page.url} (${page.source}, ${page.savedAt.slice(0, 10)}); the live site was not contacted.`;
  return findings.map((f) => {
    if (f.source !== "website") return f;
    if (f.key === "website.reachable" && f.status === "present")
      return {
        ...f,
        label: "Website inspected from a saved copy",
        evidence: tag,
        confidence: "medium",
      };
    return {
      ...f,
      evidence: `${f.evidence} [${tag}]`,
      confidence: f.confidence === "high" ? "medium" : f.confidence,
    };
  });
}

/** Apply markSavedCopy to the prospects a saved-copy scan produced. */
export function markProspectsSavedCopy(
  prospects: Prospect[],
  page: SavedPage,
): Prospect[] {
  return prospects.map((p) => ({ ...p, findings: markSavedCopy(p.findings, page) }));
}
