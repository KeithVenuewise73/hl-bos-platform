import Link from "next/link";

export function Nav({ signedInAs }: { signedInAs: string | null }) {
  return (
    <header className="nav">
      <Link href="/" className="brand">
        HighlightAI <span>Hockey</span>
      </Link>
      <nav>
        <Link href="/">Games</Link>
        <Link href="/new">New game</Link>
        <Link href="/settings">Settings</Link>
      </nav>
      {signedInAs !== null && <span className="who">{signedInAs}</span>}
    </header>
  );
}
