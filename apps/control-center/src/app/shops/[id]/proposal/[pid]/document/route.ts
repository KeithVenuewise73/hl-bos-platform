import { connect } from "@/lib/shop-audit";
import { HLD_TENANT_SLUG } from "@/lib/shop-audit-sql";
import { loadProposal } from "@/lib/proposal-sql";
import { renderProposal, referenceOf } from "@/lib/proposal-doc";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The document itself, as a standalone page.
 *
 * A route handler rather than a React page because this is the artefact: it is
 * printed, saved as a PDF and sent. It carries its own stylesheet and its own
 * print rules, and nothing of the console's chrome is around it.
 *
 * Print it from the browser (Ctrl-P / Cmd-P) to get the PDF that goes to the
 * shop.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pid: string }> },
): Promise<Response> {
  const { pid } = await params;
  if (!UUID.test(pid)) return plain(400, "That is not a proposal.");

  const state = await connect();
  if (!state.connected) return plain(503, state.reason);

  let proposal;
  try {
    proposal = await loadProposal(state.conn.run, HLD_TENANT_SLUG, pid);
  } catch (e) {
    // Say what failed. A blank document is indistinguishable from a proposal
    // with nothing in it, and those are very different situations.
    return plain(502, `Could not read this proposal: ${(e as Error).message}`);
  }
  if (proposal === null) return plain(404, "There is no proposal with that reference.");

  return new Response(
    renderProposal(proposal.document, {
      reference: referenceOf(proposal.id),
      isDraft: proposal.status === "draft",
    }),
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // The console is local-only, but a proposal is a customer document and
        // should not be cached or indexed anywhere at any point.
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

function plain(status: number, message: string): Response {
  return new Response(`${message}\n`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
