import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1>That page does not exist</h1>
      <p>Nothing you have recorded is affected — your games are stored on this device.</p>
      <Link className="btn btn-primary" href="/">
        Go to my teams
      </Link>
    </main>
  );
}
