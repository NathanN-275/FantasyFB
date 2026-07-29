import type {
  DraftGuide,
  GuideCalloutCollection,
  GuideNarrative,
  GuidePlayerCallout
} from "@fantasyfb/draft-guide";
import Link from "next/link";
import { sampleDraftGuide } from "../../../server/sample-draft-guide";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DraftGuidePage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const printView = params.view === "print";
  const guide = sampleDraftGuide;

  return (
    <main id="top" className={`${styles.guideShell} ${printView ? styles.printView : ""}`}>
      <nav className={`site-nav ${styles.siteNav}`} aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/players">Players</Link>
          <Link aria-current="page" href="/draft-guide">
            Draft guide
          </Link>
          <Link href="/draft-demo">Draft room</Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className="eyebrow">
            {guide.metadata.sampleData
              ? "PUBLIC DEMO · SYNTHETIC SAMPLE DATA"
              : "DATA-DRIVEN DRAFT GUIDE"}
          </p>
          <h1>{guide.metadata.season} draft field manual</h1>
          <p className={styles.heroCopy}>
            A league-aware plan built from versioned projections, rankings, ADP, historical
            production, roster context, and documented editorial inputs. Every player callout shows
            its evidence.
          </p>
          <div className={styles.heroActions}>
            <Link
              className="button-link"
              href={printView ? "/draft-guide" : "/draft-guide?view=print"}
            >
              {printView ? "Return to web guide" : "Open printable view"}
            </Link>
            <a className="text-link" href="#checklist">
              Jump to checklist
            </a>
          </div>
        </div>
        <div className={styles.buildStamp} aria-label="Guide build details">
          <span>GUIDE BUILD</span>
          <strong>{formatDate(guide.metadata.generatedAt)}</strong>
          <small>{guide.metadata.rankingVersion}</small>
        </div>
      </header>

      <section className={styles.disclosure} aria-labelledby="sample-heading">
        <strong id="sample-heading">
          {guide.metadata.sampleData ? "Synthetic data disclosure" : "Guide scope"}
        </strong>
        <p>
          {guide.metadata.sampleData
            ? "All player names, numbers, market values, and editorial notes on this page are fictional portfolio fixtures. They are not current NFL advice."
            : "This guide reflects the versions and assumptions shown below; refresh it when inputs change."}
        </p>
      </section>

      <BuildMetadata guide={guide} />

      <nav className={styles.sectionNav} aria-label="Draft guide sections">
        {guide.navigation.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.label}
          </a>
        ))}
      </nav>

      <nav className={styles.positionNav} aria-label="Position strategy navigation">
        <span>POSITION PLAN</span>
        {guide.positionStrategy.map((item) => (
          <a key={item.id} href={`#${item.id}`}>
            {item.title.replace(" strategy", "")}
          </a>
        ))}
      </nav>

      <section className={styles.guideSection} id="strategy" aria-labelledby="strategy-heading">
        <SectionHeading
          kicker="Overall strategy"
          title="Build a roster with discipline"
          description="The guide responds to the configured league and scoring format; it does not prescribe one universal draft order."
        />
        <NarrativeGrid items={guide.overallStrategy} />

        <div className={styles.contextGrid}>
          <NarrativeCard item={guide.leagueSizeEffects} />
          <NarrativeCard item={guide.scoringFormatEffects} />
        </div>

        <div className={styles.subsectionHeading}>
          <p className="section-kicker">Position strategy</p>
          <h2>Know where the player pool bends</h2>
        </div>
        <NarrativeGrid items={guide.positionStrategy} anchorCards />
      </section>

      <section className={styles.guideSection} id="rounds" aria-labelledby="rounds-heading">
        <SectionHeading
          kicker="Round-by-round targets"
          title="Enter every turn with options"
          description="Rounds come from Model Rank and the configured 12-team room. ADP is context for timing, never a certainty."
        />
        <div className={styles.roundGrid}>
          {guide.roundTargets.map((round) => (
            <article className={styles.roundCard} key={round.round}>
              <header>
                <span>ROUND</span>
                <strong>{round.round}</strong>
                <small>{round.label}</small>
              </header>
              <div>
                {round.players.map((callout) => (
                  <CompactPlayer key={callout.id} callout={callout} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.guideSection} id="tiers" aria-labelledby="tiers-heading">
        <SectionHeading
          kicker="Player tiers"
          title="Treat the gaps as information"
          description="Tier membership is reproduced from the validated ranking build; the cards retain player-level source references."
        />
        <div className={styles.tierStack}>
          {guide.playerTiers.map((tier) => (
            <article className={styles.tierRow} key={tier.tier}>
              <header>
                <span>TIER</span>
                <strong>{tier.tier}</strong>
              </header>
              <div>
                {tier.players.map((callout) => (
                  <CompactPlayer key={callout.id} callout={callout} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.guideSection} id="targets" aria-labelledby="targets-heading">
        <SectionHeading
          kicker="Player target board"
          title="Claims with receipts"
          description="Generated thresholds and documented editorial input can qualify a player. Missing rookie or handcuff evidence stays visibly missing."
        />
        <CalloutSection collection={guide.sleepers} />
        <CalloutSection collection={guide.breakoutCandidates} />
        <CalloutSection collection={guide.bustRiskPlayers} tone="risk" />
        <CalloutSection collection={guide.rookies} />
        <CalloutSection collection={guide.handcuffs} />
        <CalloutSection collection={guide.lateRoundTargets} />
        <CalloutSection collection={guide.modelVersusAdp} />
      </section>

      <section
        className={styles.guideSection}
        id="construction"
        aria-labelledby="construction-heading"
      >
        <SectionHeading
          kicker="Roster construction"
          title="Translate the board into a lineup"
          description="League size, starter requirements, bye weeks, and position scarcity change the cost of waiting."
        />
        <div className={styles.constructionGrid}>
          <NarrativeGroup title="Roster construction" items={guide.rosterConstruction} />
          <NarrativeGroup title="Bye-week planning" items={guide.byeWeekPlanning} />
          <NarrativeGroup title="Position scarcity" items={guide.positionScarcity} />
        </div>
      </section>

      <section className={styles.guideSection} id="checklist" aria-labelledby="checklist-heading">
        <SectionHeading
          kicker="Draft-day checklist"
          title="Before the clock starts"
          description="A short operating checklist for keeping the guide, roster, and live room aligned."
        />
        <ol className={styles.checklist}>
          {guide.draftDayChecklist.map((item, index) => (
            <li key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.guideSection} id="glossary" aria-labelledby="glossary-heading">
        <SectionHeading
          kicker="Fantasy glossary"
          title="Read the board precisely"
          description="Terms describe the model and guide behavior; ranges and market estimates are never guarantees."
        />
        <dl className={styles.glossary}>
          {guide.glossary.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.guideSection} id="sources" aria-labelledby="sources-heading">
        <SectionHeading
          kicker="Data-source notes"
          title="Versions behind this guide"
          description={`Last updated ${formatTimestamp(guide.metadata.generatedAt)}. Rebuild the guide whenever an input version or league assumption changes.`}
        />
        {guide.warnings.length ? (
          <aside className={styles.warnings} aria-labelledby="warnings-heading">
            <strong id="warnings-heading">Known input limitations</strong>
            <ul>
              {guide.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </aside>
        ) : null}
        <div className={styles.sourceTableWrap}>
          <table className={styles.sourceTable}>
            <caption>Traceable datasets and editorial inputs used in this guide build</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Kind</th>
                <th scope="col">Version</th>
                <th scope="col">Retrieved</th>
                <th scope="col">Usage note</th>
              </tr>
            </thead>
            <tbody>
              {guide.sources.map((source) => (
                <tr key={source.id}>
                  <th scope="row">
                    {source.sourceUrl ? (
                      <a href={source.sourceUrl}>{source.label}</a>
                    ) : (
                      source.label
                    )}
                    {source.isSample ? <small>SAMPLE</small> : null}
                  </th>
                  <td>{source.kind}</td>
                  <td>{source.datasetVersion}</td>
                  <td>{formatDate(source.retrievedAt)}</td>
                  <td>{source.usageNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.guideFooter}>
        <p>
          Guide generated from structured, traceable data ·{" "}
          {formatTimestamp(guide.metadata.generatedAt)}
        </p>
        <a href="#top" className="text-link">
          Back to top
        </a>
      </footer>
    </main>
  );
}

function BuildMetadata({ guide }: { guide: DraftGuide }) {
  return (
    <section className={styles.metadata} aria-label="Guide version and assumptions">
      <div>
        <span>SEASON</span>
        <strong>{guide.metadata.season}</strong>
      </div>
      <div>
        <span>PROJECTION</span>
        <strong>{guide.metadata.projectionVersion}</strong>
      </div>
      <div>
        <span>RANKING</span>
        <strong>{guide.metadata.rankingVersion}</strong>
      </div>
      <div>
        <span>ADP SNAPSHOT</span>
        <strong>{guide.metadata.adpSnapshot ?? "Unavailable"}</strong>
      </div>
      <details>
        <summary>Active assumptions</summary>
        <div className={styles.assumptionGrid}>
          <div>
            <strong>Scoring</strong>
            <ul>
              {guide.metadata.scoringAssumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>League</strong>
            <ul>
              {guide.metadata.leagueSizeAssumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Dataset versions</strong>
            <ul>
              {guide.metadata.datasetVersions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

function SectionHeading({
  kicker,
  title,
  description
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <p className="section-kicker">{kicker}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function NarrativeGrid({
  items,
  anchorCards = false
}: {
  items: readonly GuideNarrative[];
  anchorCards?: boolean;
}) {
  return (
    <div className={styles.narrativeGrid}>
      {items.map((item) => (
        <NarrativeCard key={item.id} item={item} anchor={anchorCards} />
      ))}
    </div>
  );
}

function NarrativeCard({ item, anchor = false }: { item: GuideNarrative; anchor?: boolean }) {
  return (
    <article className={styles.narrativeCard} id={anchor ? item.id : undefined}>
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </article>
  );
}

function NarrativeGroup({ title, items }: { title: string; items: readonly GuideNarrative[] }) {
  return (
    <article className={styles.narrativeGroup}>
      <h3>{title}</h3>
      {items.map((item) => (
        <div key={item.id}>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </div>
      ))}
    </article>
  );
}

function CompactPlayer({ callout }: { callout: GuidePlayerCallout }) {
  return (
    <article className={styles.compactPlayer}>
      <div>
        <span>
          {callout.player.position} · {callout.player.team}
        </span>
        <Link href={`/players/${callout.player.slug}`}>{callout.player.playerName}</Link>
      </div>
      <strong>{callout.headline}</strong>
      <Evidence evidence={callout.evidence} compact />
    </article>
  );
}

function CalloutSection({
  collection,
  tone
}: {
  collection: GuideCalloutCollection;
  tone?: "risk";
}) {
  return (
    <section
      className={styles.calloutSection}
      aria-labelledby={`${slug(collection.title)}-heading`}
    >
      <header>
        <div>
          <p className="section-kicker">Player research</p>
          <h3 id={`${slug(collection.title)}-heading`}>{collection.title}</h3>
        </div>
        <p>{collection.description}</p>
      </header>
      {collection.items.length ? (
        <div className={styles.calloutGrid}>
          {collection.items.map((callout) => (
            <article
              className={`${styles.calloutCard} ${tone === "risk" ? styles.riskCard : ""}`}
              key={callout.id}
            >
              <div className={styles.playerTopline}>
                <span>
                  {callout.player.position} · {callout.player.team}
                </span>
                <span>{callout.metrics[1]}</span>
              </div>
              <h4>
                <Link href={`/players/${callout.player.slug}`}>{callout.player.playerName}</Link>
              </h4>
              <strong>{callout.headline}</strong>
              <p>{callout.explanation}</p>
              <ul className={styles.metricChips} aria-label="Player metrics">
                {callout.metrics.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
              <Evidence evidence={callout.evidence} />
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>NO VALIDATED CALLOUTS</strong>
          <p>{collection.emptyReason}</p>
        </div>
      )}
    </section>
  );
}

function Evidence({
  evidence,
  compact = false
}: {
  evidence: GuidePlayerCallout["evidence"];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className={styles.compactEvidence}>
        Evidence: {evidence.map((item) => item.datasetVersion).join(" · ")}
      </span>
    );
  }
  return (
    <details className={styles.evidence}>
      <summary>
        {evidence.length} supporting source{evidence.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {evidence.map((item) => (
          <li key={`${item.sourceId}-${item.signal}`}>
            <strong>{item.signal}</strong>
            <span>
              {item.sourceLabel} · {item.datasetVersion}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatTimestamp(value: Date): string {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
