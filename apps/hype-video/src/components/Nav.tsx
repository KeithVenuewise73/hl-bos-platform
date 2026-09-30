import Link from "next/link";

export function Nav() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <span className="star">5★</span> Hype Video
          </span>
          <span className="brand-sub">5-Star Sports Media</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/">Dashboard</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/projects/new" className="primary">
            + New hype video
          </Link>
        </nav>
      </div>
    </header>
  );
}
