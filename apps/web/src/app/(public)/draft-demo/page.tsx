import Link from "next/link";
import { DraftRoomPanel } from "../../../components/draft-room-panel";

export default function DraftDemoPage() {
  return (
    <main className="research-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/players">Players</Link>
          <Link aria-current="page" href="/draft-demo">
            Draft demo
          </Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>
      <header className="directory-hero">
        <div>
          <p className="eyebrow">PUBLIC DEMO · FICTIONAL FIXTURE DATA ONLY</p>
          <h1>Draft command center</h1>
          <p className="hero-copy">
            Test fast manual entry, provider polling, corrections, undo, and deterministic replay
            without connecting a real league.
          </p>
        </div>
        <div className="season-stamp" aria-label="Append-only draft simulator">
          <span>MODE</span>
          <strong>LIVE</strong>
          <small>EVENT REPLAY</small>
        </div>
      </header>
      <DraftRoomPanel />
    </main>
  );
}
