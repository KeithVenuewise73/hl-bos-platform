import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p className="muted">
        That record does not exist. It may have been deleted with the sample data.
      </p>
      <Link className="btn" href="/">
        Back to the dashboard
      </Link>
    </>
  );
}
