"use client";

import type {
  DraftRecommendationPlayer,
  DraftRecommendationResult,
  DraftRecommendationStrategy
} from "@fantasyfb/draft-room";

const STRATEGY_LABELS: Record<DraftRecommendationStrategy, string> = {
  "best-overall-value": "Best overall value",
  "safest-selection": "Safest selection",
  "highest-upside": "Highest upside",
  "positional-need": "Positional need",
  "tier-protection": "Tier protection",
  "contrarian-selection": "Contrarian"
};

interface DraftRecommendationPanelProps {
  readonly result: DraftRecommendationResult | null;
  readonly players: readonly DraftRecommendationPlayer[];
  readonly queue: readonly string[];
  readonly watchlist: readonly string[];
  readonly selectedPlayerId: string | undefined;
  readonly onSelect: (playerId: string) => void;
  readonly onToggleQueue: (playerId: string) => void;
  readonly onToggleWatchlist: (playerId: string) => void;
}

function percent(probability: number | null) {
  return probability === null ? "—" : `${Math.round(probability * 100)}%`;
}

function starterCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function DraftRecommendationPanel({
  result,
  players,
  queue,
  watchlist,
  selectedPlayerId,
  onSelect,
  onToggleQueue,
  onToggleWatchlist
}: DraftRecommendationPanelProps) {
  if (!result) {
    return (
      <section className="recommendation-shell" aria-labelledby="recommendation-heading">
        <div className="draft-panel-heading">
          <div>
            <p className="section-kicker">Decision support</p>
            <h3 id="recommendation-heading">Draft recommendations</h3>
          </div>
          <span>Draft pool exhausted</span>
        </div>
        <p className="draft-empty">No undrafted fixture players remain to evaluate.</p>
      </section>
    );
  }

  const uniquePlayers = new Map(players.map((player) => [player.playerId, player]));
  const namedQueue = queue.flatMap((playerId) => {
    const player = uniquePlayers.get(playerId);
    return player ? [player] : [];
  });
  const namedWatchlist = watchlist.flatMap((playerId) => {
    const player = uniquePlayers.get(playerId);
    return player ? [player] : [];
  });

  return (
    <section className="recommendation-shell" aria-labelledby="recommendation-heading">
      <div className="recommendation-heading">
        <div>
          <p className="section-kicker">Decision support · interpretable signals</p>
          <h3 id="recommendation-heading">Draft recommendations</h3>
          <p>
            Six distinct strategies show their ranking, roster, tier, market, availability, and risk
            reasoning. No single hidden score decides the pick.
          </p>
        </div>
        <div className="recommendation-badges" aria-label="Recommendation status">
          <span>{result.mode} mode</span>
          <span className={`sync-${result.synchronization.state}`}>
            {result.synchronization.state}
          </span>
        </div>
      </div>

      <div className="forecast-ribbon" aria-label="Next pick forecast">
        <div>
          <span>On the clock</span>
          <strong>Pick {result.forecast.currentOverallPick}</strong>
          <small>{result.forecast.currentOwnerTeamId}</small>
        </div>
        <div>
          <span>Your next pick</span>
          <strong>{result.forecast.nextUserPick ?? "—"}</strong>
          <small>{result.forecast.format.replaceAll("-", " ")}</small>
        </div>
        <div>
          <span>Following pick</span>
          <strong>{result.forecast.followingUserPick ?? "—"}</strong>
          <small>Used for availability estimates</small>
        </div>
        <div>
          <span>Availability check</span>
          <strong>{result.availabilityModel.evaluatedSamples} sims</strong>
          <small>
            {result.availabilityModel.brierScore === null
              ? "Uncalibrated"
              : `Brier ${result.availabilityModel.brierScore}`}
          </small>
        </div>
      </div>

      <div className="recommendation-grid">
        {result.recommendations.map((recommendation) => {
          const playerId = recommendation.player.playerId;
          return (
            <article
              className={`recommendation-card ${
                selectedPlayerId === playerId ? "recommendation-card-selected" : ""
              }`}
              key={recommendation.strategy}
            >
              <header>
                <span>{STRATEGY_LABELS[recommendation.strategy]}</span>
                <span className="position-chip">{recommendation.player.position}</span>
              </header>
              <h4>{recommendation.player.playerName}</h4>
              <p>{recommendation.explanation[0]}</p>
              <dl>
                <div>
                  <dt>{recommendation.ranking.source} rank</dt>
                  <dd>{recommendation.ranking.rank}</dd>
                </div>
                <div>
                  <dt>Tier</dt>
                  <dd>
                    {recommendation.player.position}
                    {recommendation.tier.position}
                  </dd>
                </div>
                <div>
                  <dt>ADP gap</dt>
                  <dd>
                    {recommendation.adpDifference === null
                      ? "—"
                      : `${recommendation.adpDifference > 0 ? "+" : ""}${recommendation.adpDifference}`}
                  </dd>
                </div>
                <div>
                  <dt>At next pick</dt>
                  <dd>{percent(recommendation.expectedAvailability.probability)}</dd>
                </div>
                <div>
                  <dt>Risk</dt>
                  <dd>{recommendation.risk.label}</dd>
                </div>
                <div>
                  <dt>Need</dt>
                  <dd>{Math.round(recommendation.positionalNeed.urgency * 100)}%</dd>
                </div>
              </dl>
              <details>
                <summary>Why this player</summary>
                <ul>
                  {recommendation.explanation.slice(1).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
              <div className="recommendation-actions">
                <button type="button" onClick={() => onSelect(playerId)}>
                  {selectedPlayerId === playerId ? "Selected" : "Select"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  aria-pressed={queue.includes(playerId)}
                  onClick={() => onToggleQueue(playerId)}
                >
                  {queue.includes(playerId) ? "Queued" : "Queue"}
                </button>
                <button
                  className="text-button"
                  type="button"
                  aria-pressed={watchlist.includes(playerId)}
                  onClick={() => onToggleWatchlist(playerId)}
                >
                  {watchlist.includes(playerId) ? "Watching" : "Watch"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="recommendation-support-grid">
        <section aria-labelledby="roster-needs-heading">
          <div className="draft-panel-heading">
            <div>
              <p className="section-kicker">Starting lineup</p>
              <h4 id="roster-needs-heading">Roster needs</h4>
            </div>
          </div>
          <div className="roster-needs-list">
            {result.rosterNeeds
              .filter(({ targetStarterCount }) => targetStarterCount > 0)
              .map((need) => (
                <div key={need.position}>
                  <span>{need.position}</span>
                  <span>
                    {need.currentCount}/{starterCount(need.targetStarterCount)}
                  </span>
                  <progress max={1} value={1 - need.urgency}>
                    {Math.round((1 - need.urgency) * 100)}%
                  </progress>
                </div>
              ))}
          </div>
        </section>

        <section aria-labelledby="queue-heading">
          <div className="draft-panel-heading">
            <div>
              <p className="section-kicker">Ordered targets</p>
              <h4 id="queue-heading">Draft queue</h4>
            </div>
            <span>{namedQueue.length}</span>
          </div>
          {namedQueue.length ? (
            <ol className="recommendation-list">
              {namedQueue.map((player) => (
                <li key={player.playerId}>
                  <button type="button" onClick={() => onSelect(player.playerId)}>
                    <span>{player.playerName}</span>
                    <small>{player.position}</small>
                  </button>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => onToggleQueue(player.playerId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="draft-empty">Queue a recommendation to preserve your preferred order.</p>
          )}
        </section>

        <section aria-labelledby="watchlist-heading">
          <div className="draft-panel-heading">
            <div>
              <p className="section-kicker">Preference signal</p>
              <h4 id="watchlist-heading">Watchlist</h4>
            </div>
            <span>{namedWatchlist.length}</span>
          </div>
          {namedWatchlist.length ? (
            <ul className="recommendation-list">
              {namedWatchlist.map((player) => (
                <li key={player.playerId}>
                  <button type="button" onClick={() => onSelect(player.playerId)}>
                    <span>{player.playerName}</span>
                    <small>{player.position}</small>
                  </button>
                  <button
                    className="text-button danger"
                    type="button"
                    onClick={() => onToggleWatchlist(player.playerId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="draft-empty">Watch a player to use that preference in tie-breaks.</p>
          )}
        </section>
      </div>

      <div className="recommendation-footer">
        <div>
          <strong>Source freshness</strong>
          {Object.entries(result.sourceFreshness).map(([source, freshness]) => (
            <span className={`freshness-${freshness}`} key={source}>
              {source}: {freshness}
            </span>
          ))}
        </div>
        <p title={result.availabilityModel.formula}>{result.availabilityModel.interpretation}</p>
      </div>

      {result.tierWarnings.length ? (
        <aside className="tier-warning" aria-label="Tier drop warnings">
          <strong>Tier-drop warnings</strong>
          <ul>
            {result.tierWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}
