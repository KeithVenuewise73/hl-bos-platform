// Proposal narrative AI helper (Business proposal, Checkpoint 7).
//
// AI drafts human-readable narrative ONLY (executive summary, plain-language
// service explanations, work-order descriptions, readiness summaries). It is
// fenced as UNTRUSTED (reusing the discovery injection guard), structurally
// validated, and NON-BLOCKING: if it fails or returns invalid/price-bearing/
// guaranteed-outcome text, the deterministic proposal + provisioning records
// remain fully usable. AI never sets or changes a price, approves, accepts, or
// marks readiness — those are deterministic, permission-gated DB actions.

import { buildAnalysisRequest } from "../discovery/injection.ts";
import { validateStructuredOutput } from "../ai/structured.ts";
import { redact } from "../ai/redact.ts";

// A narrative must not fabricate a price or guarantee an outcome.
const PRICE_CLAIM = /(\$\s?\d[\d,]*(\.\d+)?)|\b\d+\s?(usd|dollars)\b/i;
const GUARANTEE = /\b(guarantee|guaranteed|guarantees)\b/i;

export interface NarrativeResult {
  ok: boolean;
  executiveSummary: string | null;
  serviceExplanations: { key: string; text: string }[];
  error?: string;
}

export interface NarrativeInputs {
  // Trusted, deterministic facts (NOT prices): business name, selected service
  // keys, deterministic finding labels. Prices are intentionally excluded.
  businessName: string;
  selectedServiceKeys: string[];
  findingLabels: string[];
  analyze: (req: ReturnType<typeof buildAnalysisRequest>) => Promise<unknown>;
}

export async function draftProposalNarrative(
  inputs: NarrativeInputs,
): Promise<NarrativeResult> {
  const empty: NarrativeResult = {
    ok: false,
    executiveSummary: null,
    serviceExplanations: [],
  };
  try {
    // Untrusted material is only the free-text finding labels; prices are never
    // sent to the model so it cannot "confirm" or invent one.
    const untrusted = inputs.findingLabels.join("\n");
    const req = buildAnalysisRequest({
      systemInstructions:
        "You draft a business proposal narrative. Output JSON only. Do NOT include any price, " +
        "dollar amount, or guaranteed outcome. Explain services in plain language.",
      rubric:
        "Return { executive_summary: string, service_explanations: [{ key, text }] }. " +
        "Keys must come from the provided service list.",
      untrustedContent: `Business: ${inputs.businessName}\nSelected services: ${inputs.selectedServiceKeys.join(", ")}\nFindings:\n${untrusted}`,
      requiredKeys: ["executive_summary", "service_explanations"],
    });
    const raw = await inputs.analyze(req);
    const parsed = validateStructuredOutput(
      typeof raw === "string" ? raw : JSON.stringify(raw),
      {
        requiredKeys: req.requiredKeys,
      },
    ) as { executive_summary?: unknown; service_explanations?: unknown };

    const summary =
      typeof parsed.executive_summary === "string" ? parsed.executive_summary : "";
    if (PRICE_CLAIM.test(summary) || GUARANTEE.test(summary)) {
      return { ...empty, error: "ai_output_rejected:price_or_guarantee_in_narrative" };
    }
    const allowed = new Set(inputs.selectedServiceKeys);
    const explanations = Array.isArray(parsed.service_explanations)
      ? parsed.service_explanations
      : [];
    const clean = explanations
      .filter((e) => {
        const k = (e as { key?: unknown }).key;
        const t = (e as { text?: unknown }).text;
        return (
          typeof k === "string" &&
          allowed.has(k) &&
          typeof t === "string" &&
          !PRICE_CLAIM.test(t) &&
          !GUARANTEE.test(t)
        );
      })
      .map((e) => ({
        key: String((e as { key: string }).key),
        text: String((e as { text: string }).text),
      }));

    return { ok: true, executiveSummary: summary || null, serviceExplanations: clean };
  } catch (e) {
    return { ...empty, error: redact(String(e)) };
  }
}
