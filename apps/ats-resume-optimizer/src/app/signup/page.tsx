import { config } from "@/lib/config.ts";
import { SignupForm } from "@/components/SignupForm.tsx";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  // Private beta closes the form without closing the app: existing accounts
  // keep working, and the page says plainly that accounts are made by hand.
  return <SignupForm open={!config().privateBeta} />;
}
