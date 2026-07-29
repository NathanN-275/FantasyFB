import Link from "next/link";
import { TradeAnalyzerPanel } from "../../../components/trade-analyzer-panel";
import { TRADE_DEMO_INPUT } from "../../../fixtures/trade-evaluation";
import styles from "./page.module.css";

export default function TradeDemoPage() {
  return (
    <main className="research-shell">
      <nav className={`site-nav ${styles.nav}`} aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className={`nav-links ${styles.navLinks}`}>
          <Link href="/players">Players</Link>
          <Link href="/draft-demo">Draft demo</Link>
          <Link aria-current="page" href="/trade-demo">
            Trade analyzer
          </Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>
      <header className="directory-hero">
        <div>
          <p className="eyebrow">PUBLIC DEMO · SYNTHETIC FIXTURE DATA ONLY</p>
          <h1>Trade lab</h1>
          <p className="hero-copy">
            Test one-for-one and multi-player packages against their actual lineup, bench,
            replacement, risk, and roster-construction effects.
          </p>
        </div>
        <div className="season-stamp" aria-label="Explainable trade analysis">
          <span>ANALYSIS</span>
          <strong>A ⇄ B</strong>
          <small>NO MYSTERY SCORE</small>
        </div>
      </header>
      <TradeAnalyzerPanel input={TRADE_DEMO_INPUT} fixtureLabel="Synthetic fixture data only" />
    </main>
  );
}
