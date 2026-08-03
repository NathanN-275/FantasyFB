import Link from "next/link";

export default function PublicHomePage() {
  return (
    <main className="home-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/features">Features</Link>
          <Link href="/league-demo">Sample league</Link>
          <Link href="/rankings">Rankings</Link>
          <Link href="/players">Players</Link>
          <Link href="/news">News</Link>
          <Link href="/draft-guide">Draft guide</Link>
          <Link href="/draft-demo">Draft demo</Link>
          <Link href="/trade-demo">Trade analyzer</Link>
          <Link href="/about">How it works</Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">PUBLIC DEMO · SAMPLE DATA ONLY</p>
          <h1>Draft with a point of view.</h1>
          <p>
            Transparent player intelligence for the 2026 season - projections, ranks, risk, ADP, and
            every source behind the call.
          </p>
          <div className="hero-actions">
            <Link className="button-link" href="/features">
              Explore the public demo
            </Link>
            <Link className="button-link" href="/players">
              Explore player research
            </Link>
            <Link className="text-link" href="/draft-demo">
              Run the draft simulator
            </Link>
            <Link className="text-link" href="/draft-guide">
              Open the data-driven draft guide
            </Link>
            <Link className="text-link" href="/trade-demo">
              Compare a multi-player trade
            </Link>
            <Link className="text-link" href="/news">
              Read the attributed sample news feed
            </Link>
            <Link className="text-link" href="/sign-in">
              Sign in to the private workspace
            </Link>
          </div>
        </div>
        <div className="home-board" aria-label="Sample analysis preview">
          <p>MODEL BOARD · TOP SIGNAL</p>
          <strong>+5.8</strong>
          <span>picks of sample ADP value</span>
          <div className="mini-range" aria-hidden="true">
            <i />
          </div>
          <small>Confidence 91% · Low risk</small>
        </div>
      </section>

      <section className="home-proof" aria-label="Research features">
        <article>
          <span>01</span>
          <h2>One evaluation</h2>
          <p>
            History, projections, rankings, ADP, injury context, news, and freshness in one view.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Explain the gap</h2>
          <p>Compare the model directly with expert inputs and the draft market.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Trust the label</h2>
          <p>
            Missing, stale, private, and synthetic inputs are never passed off as current facts.
          </p>
        </article>
      </section>
      <footer className="public-home-footer">
        <p>PUBLIC DEMO · SYNTHETIC SAMPLE DATA ONLY</p>
        <div>
          <Link href="/about">Architecture, methodology, and data sources</Link>
          <a href="https://github.com/NathanN-275/FantasyFB">GitHub repository</a>
        </div>
      </footer>
    </main>
  );
}
