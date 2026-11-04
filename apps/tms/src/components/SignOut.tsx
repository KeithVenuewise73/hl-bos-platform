"use client";

export function SignOut() {
  return (
    <button
      data-testid="sign-out"
      className="underline"
      onClick={() =>
        void fetch("/api/session", { method: "DELETE" }).then(() =>
          window.location.assign("/login"),
        )
      }
    >
      sign out
    </button>
  );
}
