"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="display text-xl text-low">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        This page could not be shown. Nothing you uploaded has been lost.{" "}
        {error.digest ? `(Reference ${error.digest})` : ""}
      </p>
      <button className="btn-primary mt-4" onClick={reset} type="button">
        Try again
      </button>
    </div>
  );
}
