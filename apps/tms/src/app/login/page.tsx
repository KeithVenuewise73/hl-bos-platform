import { PageTitle } from "@/components/ui.tsx";
import { LoginForm } from "@/components/LoginForm.tsx";

export default function Login() {
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle
        title="Sign in"
        sub="HSCS TransportationOS — isolated development environment"
      />
      <LoginForm />
      <p className="mt-4 text-xs text-muted">
        Synthetic accounts only (for example <code>morgan@lakeshore.example.test</code>{" "}
        or <code>sam@twotrucks.example.test</code>); the development password is in the
        app README. Production sign-in will be HL-BOS accounts.
      </p>
    </div>
  );
}
