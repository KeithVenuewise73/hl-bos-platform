import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6">
      <h1 className="display text-xl">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        That page, photo or player does not exist in your organization.
      </p>
      <Link className="btn-ghost mt-4" href="/">
        Back to the dashboard
      </Link>
    </div>
  );
}
