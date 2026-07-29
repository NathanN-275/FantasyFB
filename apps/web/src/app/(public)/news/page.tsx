import type { NewsCategory, NewsDataFreshness } from "@fantasyfb/news-intelligence";
import Link from "next/link";
import { sampleNewsFeed } from "../../../server/sample-news-intelligence";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const unfiltered = await sampleNewsFeed();
  const team = single(params.team);
  const playerId = single(params.player);
  const position = allowed(single(params.position), unfiltered.filters.positions);
  const category = allowed(single(params.category), unfiltered.filters.categories);
  const freshness = allowed(single(params.freshness), ["current", "stale", "unknown"] as const);
  const feed = await sampleNewsFeed({
    ...(team ? { team } : {}),
    ...(playerId ? { playerId } : {}),
    ...(position ? { position } : {}),
    ...(category ? { categories: [category] } : {}),
    ...(freshness ? { freshness } : {})
  });

  return (
    <main className="research-shell news-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/players">Players</Link>
          <Link aria-current="page" href="/news">
            News
          </Link>
          <Link href="/draft-demo">Draft demo</Link>
          <Link href="/trade-demo">Trade analyzer</Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>

      <header className="directory-hero news-hero">
        <div>
          <p className="eyebrow">{feed.label}</p>
          <h1>News intelligence</h1>
          <p className="hero-copy">
            Attributed reporting, explicit entity matches, freshness, and a clearly separated
            fantasy interpretation.
          </p>
        </div>
        <div className="season-stamp" aria-label="Fixture news status">
          <span>FEED</span>
          <strong>{feed.records.length}</strong>
          <small>MATCHING STORIES</small>
        </div>
      </header>

      <aside className="data-warning" aria-labelledby="fixture-warning">
        <strong id="fixture-warning">Synthetic demonstration only</strong>
        <p>
          These are invented players and fixture articles. No live source is enabled until its reuse
          terms and excerpt policy are documented.
        </p>
      </aside>

      <section className="news-filter-panel" aria-labelledby="news-filter-heading">
        <div className="filter-heading-row">
          <div>
            <p className="section-kicker">Feed controls</p>
            <h2 id="news-filter-heading">Filter attributable stories</h2>
          </div>
          <span className="result-count" aria-live="polite">
            {feed.records.length} {feed.records.length === 1 ? "story" : "stories"}
          </span>
        </div>
        <form className="player-filters" action="/news">
          <label>
            <span>Team</span>
            <select name="team" defaultValue={team}>
              <option value="">All teams</option>
              {unfiltered.filters.teams.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Position</span>
            <select name="position" defaultValue={position}>
              <option value="">All positions</option>
              {unfiltered.filters.positions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Player</span>
            <select name="player" defaultValue={playerId}>
              <option value="">All players</option>
              {unfiltered.filters.players.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select name="category" defaultValue={category}>
              <option value="">All categories</option>
              {unfiltered.filters.categories.map((option) => (
                <option key={option} value={option}>
                  {label(option)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Freshness</span>
            <select name="freshness" defaultValue={freshness}>
              <option value="">Any freshness</option>
              <option value="current">Current</option>
              <option value="stale">Stale</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit">Apply filters</button>
            <Link className="text-link" href="/news">
              Reset
            </Link>
          </div>
        </form>
      </section>

      {feed.records.length ? (
        <section className="news-feed" aria-label="Attributed news feed">
          {feed.records.map((record) => (
            <article className="news-story" key={record.id}>
              <div className="news-story-meta">
                <span className={`news-category news-category-${record.category}`}>
                  {label(record.category)}
                </span>
                <span className={`freshness freshness-${record.dataFreshness}`}>
                  {record.dataFreshness === "current" ? "✓" : "!"} {label(record.dataFreshness)}
                </span>
                <span>{formatDate(record.publicationTime)}</span>
              </div>
              <h2>
                <a href={record.originalArticleUrl}>{record.headline}</a>
              </h2>
              <p className="news-attribution">
                {record.source.name} · Retrieved {formatDate(record.retrievedTime)} · Entity
                confidence {Math.round(record.entityMatchConfidence * 100)}%
              </p>
              <div className="news-entities">
                {record.relatedPlayers.map((player) => (
                  <Link href={`/players/${player.id}`} key={player.id}>
                    {player.fullName} · {player.position}
                  </Link>
                ))}
                {record.relatedTeams.map((relatedTeam) => (
                  <span key={relatedTeam.abbreviation}>{relatedTeam.abbreviation}</span>
                ))}
              </div>
              <div className="news-evidence-grid">
                <section>
                  <p className="section-kicker">Reported facts</p>
                  <p>{record.permittedExcerpt ?? "This source does not permit an excerpt."}</p>
                  {record.injuryInformation?.designation ? (
                    <p className="explicit-designation">
                      Explicit designation: {label(record.injuryInformation.designation)}
                    </p>
                  ) : null}
                </section>
                <section>
                  <p className="section-kicker">FantasyFB interpretation</p>
                  <p>{record.fantasyRelevance.text}</p>
                  <details>
                    <summary>Why this interpretation?</summary>
                    <ul>
                      {record.fantasyRelevance.reasoning.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                </section>
              </div>
              <footer>
                <a href={record.originalArticleUrl}>Read original article ↗</a>
                <span>{record.source.usageNote}</span>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className="empty-news-state">
          <p className="section-kicker">No matches</p>
          <h2>No stories match these filters.</h2>
          <Link className="text-link" href="/news">
            Clear filters
          </Link>
        </section>
      )}
    </main>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function allowed<Value extends string>(value: string, values: readonly Value[]): Value | undefined {
  return values.includes(value as Value) ? (value as Value) : undefined;
}

function label(value: NewsCategory | NewsDataFreshness | string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: Date | null): string {
  if (!value) return "Publication time unavailable";
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
