"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ActionResult } from "@/lib/actions.ts";

const IDLE: ActionResult = { ok: true, message: "" };

function Submit({
  label,
  busy,
  className,
}: {
  label: string;
  busy: string;
  className: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className ?? "primary"}>
      {pending ? busy : label}
    </button>
  );
}

/**
 * A form bound to a server action.
 *
 * The result is rendered, always. An action that failed silently is the same
 * bug as a button that does nothing — the user has no way to tell whether
 * their click landed.
 */
export function ActionForm({
  action,
  label,
  busy,
  className,
  children,
  confirm,
}: {
  action: (previous: ActionResult, form: FormData) => Promise<ActionResult>;
  label: string;
  busy: string;
  className?: string;
  children?: React.ReactNode;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  return (
    <form
      action={formAction}
      onSubmit={
        confirm === undefined
          ? undefined
          : (event) => {
              if (!window.confirm(confirm)) event.preventDefault();
            }
      }
    >
      {children}
      <Submit label={label} busy={busy} className={className} />
      {state.message.length > 0 && (
        <p className={state.ok ? "ok" : "problem"} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
