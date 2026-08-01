import { NextResponse } from "next/server";
import {
  validateIntake,
  nextStepFor,
  referenceFor,
  type IntakeInput,
} from "@/lib/intake";
import { persistLead } from "@/lib/persist";

// The commercial front door. Validates the submission, builds the lead record,
// preserves source attribution, delivers it into the customer lifecycle (when the
// delivery endpoint is configured), and returns an HONEST confirmation. It NEVER
// claims a completed AI assessment.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "invalid", errors: ["Malformed request."] },
      { status: 400 },
    );
  }

  const input = (body ?? {}) as IntakeInput;
  const result = validateIntake(input);
  if (!result.ok || !result.lead) {
    return NextResponse.json(
      { status: "invalid", errors: result.errors },
      { status: 422 },
    );
  }

  const delivery = await persistLead(result.lead);
  return NextResponse.json({
    status: "received",
    ref: referenceFor(result.lead),
    nextStep: nextStepFor(result.lead.kind),
    persisted: delivery.persisted,
  });
}
