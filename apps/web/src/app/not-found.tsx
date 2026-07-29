import Link from "next/link";

export default function NotFound() {
  return (
    <main className="research-shell">
      <section className="workspace-section" aria-labelledby="not-found-heading">
        <p className="section-kicker">404</p>
        <h1 id="not-found-heading">That page is not on the board.</h1>
        <p>The route may have moved, or the requested public sample does not exist.</p>
        <Link href="/">Return to the public demo</Link>
      </section>
    </main>
  );
}
