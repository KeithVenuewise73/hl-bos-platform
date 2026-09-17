"use server";

import { redirect } from "next/navigation";
import { readForm, handleRequest, type SubmitState } from "@/lib/submit-request";

/**
 * The assessment request server action.
 *
 * Deliberately four lines of glue. Every decision it appears to make lives in
 * `@/lib/submit-request`, which is unit-tested; this file exists only to bind
 * that to a form post and a redirect.
 *
 * The publishable key is read inside this server boundary and never crosses to
 * the browser, which is why the site's CSP can keep `connect-src 'self'`.
 */
export async function submitAssessmentRequest(
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const state = await handleRequest(readForm(formData));
  if (state.status === "ok") {
    // Only ever reached when the database returned a real reference.
    redirect(`/thank-you?ref=${encodeURIComponent(state.reference)}`);
  }
  return state;
}
