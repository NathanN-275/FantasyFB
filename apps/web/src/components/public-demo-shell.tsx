import Link from "next/link";

export function PublicNavigation({ current }: { current?: "Features" | "About" }) {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link className="wordmark" href="/">
        FANTASY<span>FB</span>
      </Link>
      <div className="nav-links">
        <Link aria-current={current === "Features" ? "page" : undefined} href="/features">
          Features
        </Link>
        <Link href="/league-demo">League</Link>
        <Link href="/rankings">Rankings</Link>
        <Link aria-current={current === "About" ? "page" : undefined} href="/about">
          How it works
        </Link>
        <Link href="/sign-in">Private workspace</Link>
      </div>
    </nav>
  );
}

export function BoundaryDisclosure() {
  return (
    <aside className="sample-disclosure" aria-label="Public and private data boundary">
      <strong>Sample means sample.</strong>
      <p>
        Public pages cannot read private leagues, rankings, imports, OAuth data, saved drafts,
        queues, trade evaluations, settings, or secrets. Those records are available only after
        server-side authorization.
      </p>
    </aside>
  );
}
