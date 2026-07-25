import type { PlayerEvaluation, PlayerProjection } from "@fantasyfb/player-intelligence";
import Link from "next/link";
import { notFound } from "next/navigation";
import { samplePlayerIntelligence } from "../../../../server/sample-player-intelligence";

export default async function PlayerProfilePage({
  params
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const player = samplePlayerIntelligence.profile(playerId);
  if (!player) notFound();

  const modelProjection = player.projections.find((projection) => projection.kind === "model");
  const expertProjection = player.projections.find((projection) => projection.kind === "expert");
  const modelRank = player.rankings.find((ranking) => ranking.kind === "model");
  const expertRank = player.rankings.find((ranking) => ranking.kind === "expert");
  const hybridRank = player.rankings.find((ranking) => ranking.kind === "hybrid");

  return (
    <main className="research-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/players">Players</Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>

      <Link className="back-link" href="/players">
        <span aria-hidden="true">←</span> Back to player board
      </Link>

      <header className="profile-hero">
        <div className="profile-monogram" aria-hidden="true">
          {initials(player.fullName)}
        </div>
        <div className="profile-title">
          <p className="eyebrow">SYNTHETIC SAMPLE PLAYER · {player.position}</p>
          <h1>{player.fullName}</h1>
          <p>
            {player.team.name} · {player.team.abbreviation} · Bye week {player.byeWeek}
          </p>
          <div className="profile-status-row">
            <StatusBadge status={player.injury.status} />
            <span className={`health-badge health-${player.dataHealth.state}`}>
              Data: {formatLabel(player.dataHealth.state)}
            </span>
          </div>
          {player.injury.detail ? <p className="injury-detail">{player.injury.detail}</p> : null}
        </div>
        <div className="profile-rank">
          <span>MODEL RANK</span>
          <strong>{modelRank ? `#${modelRank.overallRank}` : "NR"}</strong>
          <small>{modelRank ? `${player.position}${modelRank.positionRank}` : "Unavailable"}</small>
        </div>
      </header>

      {player.dataHealth.warnings.length ? (
        <aside className="data-warning" aria-labelledby="stale-heading">
          <strong id="stale-heading">Stale-data warning</strong>
          {player.dataHealth.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </aside>
      ) : null}

      <section className="metrics-ribbon" aria-label="Player evaluation summary">
        <Metric label="Model projection" value={points(modelProjection?.projectedPoints)} />
        <Metric label="Expert rank" value={expertRank ? `#${expertRank.overallRank}` : "—"} />
        <Metric label="Hybrid rank" value={hybridRank ? `#${hybridRank.overallRank}` : "—"} />
        <Metric label="ADP" value={number(player.adp?.overall, 1)} />
        <Metric label="Risk" value={`${formatLabel(player.risk.level)} · ${player.risk.score}`} />
        <Metric label="Confidence" value={percent(player.confidence)} />
      </section>

      <div className="profile-grid">
        <section className="analysis-card analysis-card-wide" aria-labelledby="projection-heading">
          <div className="card-heading-row">
            <div>
              <p className="section-kicker">Projection range</p>
              <h2 id="projection-heading">Floor, median, ceiling</h2>
            </div>
            <span className="unit-label">PPR POINTS</span>
          </div>
          {modelProjection ? (
            <ProjectionRange projection={modelProjection} />
          ) : (
            <MissingState label="Model projection unavailable" />
          )}
          <div className="projection-comparison">
            <ProjectionSummary label="FantasyFB model" projection={modelProjection} />
            <ProjectionSummary label="Expert fixture" projection={expertProjection} />
          </div>
        </section>

        <section className="analysis-card" aria-labelledby="market-heading">
          <p className="section-kicker">Market lens</p>
          <h2 id="market-heading">Model versus market</h2>
          <dl className="comparison-list">
            <Comparison
              label="vs. expert projection"
              value={signed(player.comparisons.modelVersusExpertPoints, " pts")}
              interpretation={directionLabel(player.comparisons.modelVersusExpertPoints)}
            />
            <Comparison
              label="vs. expert rank"
              value={signed(player.comparisons.modelVersusExpertRank, " spots")}
              interpretation={directionLabel(player.comparisons.modelVersusExpertRank)}
            />
            <Comparison
              label="vs. ADP"
              value={signed(player.comparisons.modelVersusAdp, " picks")}
              interpretation={directionLabel(player.comparisons.modelVersusAdp)}
            />
          </dl>
          <p className="interpretation-note">
            Positive rank and ADP gaps indicate the model values the player earlier than the
            comparison source.
          </p>
        </section>

        <section className="analysis-card analysis-card-wide" aria-labelledby="history-heading">
          <div className="card-heading-row">
            <div>
              <p className="section-kicker">Three-year form</p>
              <h2 id="history-heading">Historical fantasy production</h2>
            </div>
            <span className="unit-label">PPR POINTS</span>
          </div>
          {player.historicalSeasons.length ? (
            <HistoricalChart player={player} />
          ) : (
            <MissingState label="Historical statistics unavailable" />
          )}
        </section>

        <section className="analysis-card" aria-labelledby="risk-heading">
          <p className="section-kicker">Volatility profile</p>
          <h2 id="risk-heading">Risk and confidence</h2>
          <div className="risk-gauge" aria-label={`Risk score ${player.risk.score} out of 100`}>
            <span style={{ width: `${player.risk.score}%` }} />
          </div>
          <div className="risk-summary">
            <strong>{formatLabel(player.risk.level)} risk</strong>
            <span>{player.risk.score}/100</span>
          </div>
          <ul className="factor-list">
            {player.risk.factors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
          <p className="confidence-copy">
            Model confidence: <strong>{percent(player.confidence)}</strong>
          </p>
        </section>

        <section className="analysis-card" aria-labelledby="news-heading">
          <p className="section-kicker">Research notes</p>
          <h2 id="news-heading">News references</h2>
          {player.news.length ? (
            <div className="news-list">
              {player.news.map((item) => (
                <article key={item.id}>
                  <p className="news-date">
                    {item.publishedAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC"
                    })}
                  </p>
                  <h3>
                    <a href={item.sourceUrl}>{item.title}</a>
                  </h3>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          ) : (
            <MissingState label="No attributed news references are available" />
          )}
        </section>

        <section className="analysis-card analysis-card-full" aria-labelledby="source-heading">
          <div className="card-heading-row">
            <div>
              <p className="section-kicker">Audit trail</p>
              <h2 id="source-heading">Sources and freshness</h2>
            </div>
            <span className="unit-label">{player.sources.length} SOURCES</span>
          </div>
          <div className="source-table-wrap">
            <table className="source-table">
              <caption>Provenance for every source used in this player evaluation</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Version</th>
                  <th scope="col">Retrieved</th>
                  <th scope="col">Freshness</th>
                  <th scope="col">Usage</th>
                </tr>
              </thead>
              <tbody>
                {player.sources.map((source) => (
                  <tr key={source.id}>
                    <th scope="row">
                      {source.sourceUrl ? (
                        <a href={source.sourceUrl}>{source.label}</a>
                      ) : (
                        source.label
                      )}
                      {source.isSample ? <small>SAMPLE</small> : null}
                    </th>
                    <td>{source.datasetVersion}</td>
                    <td>
                      {source.retrievedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC"
                      })}
                    </td>
                    <td>
                      <span className={`freshness freshness-${source.freshness}`}>
                        {source.freshness === "current" ? "✓" : "!"} {formatLabel(source.freshness)}
                      </span>
                    </td>
                    <td>{source.licenseOrUsageNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {player.dataHealth.missing.length ? (
            <div className="missing-summary">
              <strong>Missing optional inputs</strong>
              <p>{player.dataHealth.missing.join(", ")}.</p>
            </div>
          ) : (
            <p className="complete-summary">✓ All expected research inputs are present.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function ProjectionRange({ projection }: { projection: PlayerProjection }) {
  const maximum = Math.max(projection.ceiling * 1.08, 1);
  return (
    <div className="range-chart">
      <div className="range-labels">
        <span>
          Floor <strong>{number(projection.floor, 1)}</strong>
        </span>
        <span>
          Median <strong>{number(projection.median, 1)}</strong>
        </span>
        <span>
          Ceiling <strong>{number(projection.ceiling, 1)}</strong>
        </span>
      </div>
      <div
        className="range-track"
        role="img"
        aria-label={`Projection range from ${projection.floor.toFixed(1)} to ${projection.ceiling.toFixed(1)} points, with median ${projection.median.toFixed(1)}`}
      >
        <span
          className="range-fill"
          style={{
            left: `${(projection.floor / maximum) * 100}%`,
            width: `${((projection.ceiling - projection.floor) / maximum) * 100}%`
          }}
        />
        <span
          className="range-median"
          style={{ left: `${(projection.median / maximum) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ProjectionSummary({
  label,
  projection
}: {
  label: string;
  projection: PlayerProjection | undefined;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{points(projection?.projectedPoints)}</strong>
      <small>
        {projection ? `${projection.projectedPointsPerGame.toFixed(1)} per game` : "Missing input"}
      </small>
    </div>
  );
}

function HistoricalChart({ player }: { player: PlayerEvaluation }) {
  const width = 600;
  const height = 190;
  const padding = 24;
  const values = player.historicalSeasons.map((season) => season.fantasyPoints);
  const maximum = Math.max(...values) * 1.12;
  const minimum = Math.min(...values) * 0.88;
  const range = Math.max(maximum - minimum, 1);
  const points = player.historicalSeasons
    .map((season, index) => {
      const x =
        player.historicalSeasons.length === 1
          ? width / 2
          : padding + (index * (width - padding * 2)) / (player.historicalSeasons.length - 1);
      const y =
        height - padding - ((season.fantasyPoints - minimum) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="history-chart-wrap">
      <svg
        className="history-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby="history-chart-title history-chart-description"
      >
        <title id="history-chart-title">{`${player.fullName} historical fantasy production`}</title>
        <desc id="history-chart-description">
          {player.historicalSeasons
            .map((season) => `${season.season}: ${season.fantasyPoints.toFixed(1)} points`)
            .join("; ")}
        </desc>
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        <polyline points={points} />
        {points.split(" ").map((point, index) => {
          const [cx, cy] = point.split(",");
          return <circle key={player.historicalSeasons[index]!.season} cx={cx} cy={cy} r="5" />;
        })}
      </svg>
      <div className="history-labels" aria-hidden="true">
        {player.historicalSeasons.map((season) => (
          <span key={season.season}>
            <strong>{season.fantasyPoints.toFixed(1)}</strong>
            {season.season}
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Comparison({
  label,
  value,
  interpretation
}: {
  label: string;
  value: string;
  interpretation: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        <span>{interpretation}</span>
      </dd>
    </div>
  );
}

function MissingState({ label }: { label: string }) {
  return (
    <div className="missing-state" role="status">
      <span aria-hidden="true">—</span>
      <p>{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PlayerEvaluation["injury"]["status"] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true">{status === "healthy" ? "✓" : "!"}</span>
      {formatLabel(status)}
    </span>
  );
}

function points(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)} pts`;
}

function number(value: number | undefined, digits = 0): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

function percent(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function signed(value: number | undefined, suffix: string): string {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function directionLabel(value: number | undefined): string {
  if (value === undefined) return "Input unavailable";
  if (value > 0) return "Model is higher";
  if (value < 0) return "Model is lower";
  return "Sources agree";
}

function formatLabel(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}
