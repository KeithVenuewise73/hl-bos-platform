/**
 * Password policy — a PURE, unit-tested check for the reset-password form.
 *
 * The authoritative enforcement is Supabase's own (server-side, on
 * `auth.updateUser`). This client-side check exists only to give immediate,
 * honest feedback before the round trip — it never stores or transmits anything.
 */

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/**
 * Validate a proposed new password against its confirmation.
 * Returns the first problem found, or `{ ok: true }`.
 */
export function validateNewPassword(password: string, confirm: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    return { ok: false, message: "The two passwords do not match." };
  }
  return { ok: true };
}
