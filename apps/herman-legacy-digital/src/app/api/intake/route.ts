import { NextResponse } from "next/server";
import { handleIntake } from "@/lib/intake-handler";
import { deliverLead } from "@/lib/persist";

// The commercial front door. Validates the submission, delivers it to the
// configured destination, and answers HONESTLY: "received" only when the
// destination accepted it, otherwise "not_delivered" so the visitor can retry.
// It NEVER claims a completed AI assessment. See src/lib/intake-handler.ts.
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

  const { httpStatus, json } = await handleIntake(body, deliverLead, (msg, fields) =>
    console.info(msg, fields),
  );
  return NextResponse.json(json, { status: httpStatus });
}
