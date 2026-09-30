import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1>Not found</h1>
      <p className="muted">That project doesn&apos;t exist, or it was deleted.</p>
      <Link href="/projects" className="btn">
        Your projects
      </Link>
    </div>
  );
}
