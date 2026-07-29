"use client";

import {
  createDraftRecommendationEngine,
  replayDraftEvents,
  type DraftRecommendationPosition,
  type DraftEvent,
  type DraftPick,
  type DraftState
} from "@fantasyfb/draft-room";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DRAFT_RECOMMENDATION_PLAYERS } from "../fixtures/draft-recommendations";
import { DraftRecommendationPanel } from "./draft-recommendation-panel";

const DRAFT_ID = "fixture-draft-2026";
const TEAM_COUNT = 4;
const TEAMS = [
  { id: "team-1", name: "North Stars" },
  { id: "team-2", name: "Fourth & Long" },
  { id: "team-3", name: "Red Zone Union" },
  { id: "team-4", name: "Sunday Static" }
] as const;
const RECOMMENDATION_PLAYERS = DRAFT_RECOMMENDATION_PLAYERS;
const PLAYERS = RECOMMENDATION_PLAYERS.map((player) => ({
  id: player.playerId,
  name: player.playerName,
  position: player.position,
  nflTeam: player.nflTeam
}));
const FIXTURE_PICKS = [
  { playerId: "player-1", overallPick: 1 },
  { playerId: "player-2", overallPick: 2 },
  { playerId: "player-3", overallPick: 3 }
] as const;

function createEventId(prefix: string) {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function coordinates(overallPick: number) {
  const round = Math.ceil(overallPick / TEAM_COUNT);
  const offset = (overallPick - 1) % TEAM_COUNT;
  const draftSlot = round % 2 === 1 ? offset + 1 : TEAM_COUNT - offset;
  return { round, draftSlot, fantasyTeamId: `team-${draftSlot}` };
}

function playerName(playerId?: string, externalId?: string) {
  return PLAYERS.find((player) => player.id === playerId)?.name ?? externalId ?? "Unmapped player";
}

function teamName(teamId: string) {
  return TEAMS.find((team) => team.id === teamId)?.name ?? teamId;
}

function statusLabel(status: DraftState["status"]) {
  return status.replace("_", " ");
}

export function DraftRoomPanel() {
  const [events, setEvents] = useState<DraftEvent[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | DraftRecommendationPosition>("ALL");
  const [queue, setQueue] = useState<string[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [fixtureCursor, setFixtureCursor] = useState(0);
  const [synchronization, setSynchronization] = useState({
    state: "live" as "live" | "stale" | "completed",
    detail: "Fixture source connected. Poll when you are ready to simulate provider delivery.",
    checkedAt: "2026-07-28T20:00:00.000Z"
  });
  const state = useMemo(() => replayDraftEvents(events, DRAFT_ID), [events]);
  const recommendationResult = useMemo(() => {
    if (state.draftedPlayerIds.length >= RECOMMENDATION_PLAYERS.length) return null;
    return createDraftRecommendationEngine().recommend({
      draftState: state,
      players: RECOMMENDATION_PLAYERS,
      league: {
        teamIds: TEAMS.map((team) => team.id),
        userTeamId: "team-1",
        draftSlot: 1,
        rounds: 4,
        currentOverallPick: Math.min(state.picks.length + 1, TEAM_COUNT * 4),
        thirdRoundReversal: false,
        tradedPickOwners: { "8": "team-2", "15": "team-1" },
        scoringConfigurationIdentifier: "fixture-full-ppr-v1",
        startingLineup: [
          { name: "QB", count: 1, eligiblePositions: ["QB"] },
          { name: "RB", count: 1, eligiblePositions: ["RB"] },
          { name: "WR", count: 2, eligiblePositions: ["WR"] },
          { name: "TE", count: 1, eligiblePositions: ["TE"] },
          { name: "FLEX", count: 1, eligiblePositions: ["RB", "WR", "TE"] }
        ],
        benchSlots: 4
      },
      mode: "manual",
      synchronization,
      sourceFreshness: {
        projections: "fresh",
        rankings: "fresh",
        adp: "fresh"
      },
      preferences: {
        rankingSource: "hybrid",
        riskTolerance: "balanced",
        preferredPlayerIds: watchlist,
        avoidedPlayerIds: [],
        preferredPositions: positionFilter === "ALL" ? [] : [positionFilter]
      },
      availabilityOutcomes: [
        { playerId: "player-4", targetOverallPick: 8, wasAvailable: true },
        { playerId: "player-5", targetOverallPick: 8, wasAvailable: false },
        { playerId: "player-7", targetOverallPick: 12, wasAvailable: true },
        { playerId: "player-8", targetOverallPick: 12, wasAvailable: false }
      ]
    });
  }, [positionFilter, state, synchronization, watchlist]);

  const append = useCallback((input: Omit<DraftEvent, "sequence" | "receivedAt" | "draftId">) => {
    setEvents((current) => [
      ...current,
      {
        ...input,
        draftId: DRAFT_ID,
        sequence: (current.at(-1)?.sequence ?? 0) + 1,
        receivedAt: new Date().toISOString()
      }
    ]);
  }, []);

  const availablePlayers = useMemo(() => {
    const drafted = new Set(state.draftedPlayerIds);
    const needle = search.trim().toLowerCase();
    return PLAYERS.filter(
      (player) =>
        !drafted.has(player.id) &&
        (positionFilter === "ALL" || player.position === positionFilter) &&
        (!needle ||
          `${player.name} ${player.position} ${player.nflTeam}`.toLowerCase().includes(needle))
    );
  }, [positionFilter, search, state.draftedPlayerIds]);

  const toggleListPlayer = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    playerId: string
  ) => {
    setter((current) =>
      current.includes(playerId)
        ? current.filter((candidate) => candidate !== playerId)
        : [...current, playerId]
    );
  };

  useEffect(() => {
    const drafted = new Set(state.draftedPlayerIds);
    setQueue((current) => current.filter((playerId) => !drafted.has(playerId)));
    setWatchlist((current) => current.filter((playerId) => !drafted.has(playerId)));
  }, [state.draftedPlayerIds]);

  const recordManualPick = useCallback(() => {
    if (!selectedPlayerId || state.status === "completed") return;
    const overallPick = state.picks.length + 1;
    append({
      eventId: createEventId("manual-pick"),
      source: "manual",
      eventType: "pick_recorded",
      overallPick,
      ...coordinates(overallPick),
      playerId: selectedPlayerId,
      keeperStatus: "standard"
    });
    setSelectedPlayerId(undefined);
  }, [append, selectedPlayerId, state.picks.length, state.status]);

  const undoPick = useCallback(
    (pick: DraftPick | undefined = state.recentPicks[0]) => {
      if (!pick || state.status === "completed") return;
      append({
        eventId: createEventId("manual-undo"),
        source: "manual",
        eventType: "pick_removed",
        correctionReference: pick.eventId
      });
    },
    [append, state.recentPicks, state.status]
  );

  const correctPick = (pick: DraftPick) => {
    if (!selectedPlayerId || state.status === "completed") return;
    append({
      eventId: createEventId("manual-correction"),
      source: "manual",
      eventType: "pick_corrected",
      correctionReference: pick.eventId,
      playerId: selectedPlayerId
    });
    setSelectedPlayerId(undefined);
  };

  const togglePause = useCallback(() => {
    if (state.status === "completed") return;
    append({
      eventId: createEventId("manual-control"),
      source: "manual",
      eventType: state.status === "paused" ? "draft_resumed" : "draft_paused"
    });
  }, [append, state.status]);

  const pollFixture = () => {
    const fixture = FIXTURE_PICKS[fixtureCursor];
    const checkedAt = new Date().toISOString();
    if (!fixture) {
      setSynchronization({
        state: "completed",
        detail: "Fixture source has no more events. Manual entry remains available.",
        checkedAt
      });
      return;
    }
    if (!state.draftedPlayerIds.includes(fixture.playerId)) {
      append({
        eventId: `fixture:${fixture.overallPick}:${fixture.playerId}`,
        source: "fixture",
        eventType: "pick_recorded",
        overallPick: state.picks.length + 1,
        ...coordinates(state.picks.length + 1),
        playerId: fixture.playerId,
        keeperStatus: "standard",
        providerTimestamp: checkedAt
      });
    }
    const nextCursor = fixtureCursor + 1;
    setFixtureCursor(nextCursor);
    setSynchronization({
      state: nextCursor >= FIXTURE_PICKS.length ? "completed" : "live",
      detail:
        nextCursor >= FIXTURE_PICKS.length
          ? "Fixture source completed. All delivered events are in the log."
          : "Fixture event appended. More provider events are available.",
      checkedAt
    });
  };

  useEffect(() => {
    const keyboardHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button")) return;
      if (event.key === "Enter") {
        event.preventDefault();
        recordManualPick();
      }
      if (event.key.toLowerCase() === "u") undoPick();
      if (event.key.toLowerCase() === "p") togglePause();
    };
    window.addEventListener("keydown", keyboardHandler);
    return () => window.removeEventListener("keydown", keyboardHandler);
  }, [recordManualPick, togglePause, undoPick]);

  return (
    <section className="draft-room" aria-labelledby="draft-room-heading">
      <div className="draft-room-heading">
        <div>
          <p className="section-kicker">Draft event engine · fixture workspace</p>
          <h2 id="draft-room-heading">Live draft board</h2>
          <p>
            Every action appends an event. The board, rosters, and availability are replayed from
            that immutable history.
          </p>
        </div>
        <div className="draft-status-stack">
          <span className={`draft-status draft-status-${state.status}`}>
            {statusLabel(state.status)}
          </span>
          <span
            className={`sync-indicator sync-${synchronization.state}`}
            title={synchronization.detail}
          >
            {synchronization.state === "stale" ? "Stale data" : synchronization.state}
          </span>
        </div>
      </div>

      <div className="draft-control-bar">
        <button type="button" onClick={pollFixture}>
          Poll fixture
        </button>
        <button className="secondary-button" type="button" onClick={togglePause}>
          {state.status === "paused" ? "Resume draft" : "Pause draft"}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => undoPick()}
          disabled={!state.recentPicks.length || state.status === "completed"}
        >
          Undo latest
        </button>
        <span>
          {synchronization.detail} Checked{" "}
          {new Date(synchronization.checkedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "UTC"
          })}
          {" UTC"}.
        </span>
      </div>

      <DraftRecommendationPanel
        result={recommendationResult}
        players={RECOMMENDATION_PLAYERS}
        queue={queue}
        watchlist={watchlist}
        selectedPlayerId={selectedPlayerId}
        onSelect={setSelectedPlayerId}
        onToggleQueue={(playerId) => toggleListPlayer(setQueue, playerId)}
        onToggleWatchlist={(playerId) => toggleListPlayer(setWatchlist, playerId)}
      />

      <div className="draft-board-shell">
        <div className="draft-board-header">
          <div>
            <p className="section-kicker">Draft board</p>
            <strong>{state.picks.length} events on the board</strong>
          </div>
          <p>Snake order · {TEAM_COUNT} teams · deterministic replay</p>
        </div>
        <div className="draft-board" role="grid" aria-label="Draft picks">
          {Array.from({ length: 16 }, (_, index) => {
            const overallPick = index + 1;
            const pick = state.picks.find((candidate) => candidate.overallPick === overallPick);
            const coordinate = coordinates(overallPick);
            return (
              <article
                className={`draft-cell ${pick ? "draft-cell-filled" : ""}`}
                key={overallPick}
                role="gridcell"
              >
                <span>
                  {coordinate.round}.{String(coordinate.draftSlot).padStart(2, "0")}
                </span>
                <strong>
                  {pick ? playerName(pick.playerId, pick.playerExternalId) : "Available"}
                </strong>
                <small>
                  {pick
                    ? `${teamName(pick.fantasyTeamId)} · ${pick.keeperStatus}`
                    : teamName(coordinate.fantasyTeamId)}
                </small>
              </article>
            );
          })}
        </div>
      </div>

      <div className="draft-workspace-grid">
        <section className="available-player-panel" aria-labelledby="available-player-heading">
          <div className="draft-panel-heading">
            <div>
              <p className="section-kicker">Manual entry</p>
              <h3 id="available-player-heading">Available players</h3>
            </div>
            <span>{availablePlayers.length} available</span>
          </div>
          <label className="draft-player-search">
            <span>Search by player, position, or NFL team</span>
            <span className="draft-player-filter-row">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the board"
              />
              <select
                aria-label="Filter available players by position"
                value={positionFilter}
                onChange={(event) =>
                  setPositionFilter(event.target.value as "ALL" | DraftRecommendationPosition)
                }
              >
                <option value="ALL">All positions</option>
                <option value="QB">QB</option>
                <option value="RB">RB</option>
                <option value="WR">WR</option>
                <option value="TE">TE</option>
                <option value="K">K</option>
                <option value="DEF">DEF</option>
              </select>
            </span>
          </label>
          <div className="available-player-list">
            {availablePlayers.map((player) => (
              <button
                className={
                  selectedPlayerId === player.id ? "player-option selected" : "player-option"
                }
                type="button"
                key={player.id}
                onClick={() => setSelectedPlayerId(player.id)}
              >
                <span className="position-chip">{player.position}</span>
                <span>
                  <strong>{player.name}</strong>
                  <small>{player.nflTeam}</small>
                </span>
                <em>{selectedPlayerId === player.id ? "Selected" : "Select"}</em>
              </button>
            ))}
          </div>
          <button
            className="draft-selected-button"
            type="button"
            onClick={recordManualPick}
            disabled={!selectedPlayerId || state.status === "completed"}
          >
            Draft selected · Enter
          </button>
        </section>

        <section className="recent-pick-panel" aria-labelledby="recent-pick-heading">
          <div className="draft-panel-heading">
            <div>
              <p className="section-kicker">Pick history · event tools</p>
              <h3 id="recent-pick-heading">Recent picks</h3>
            </div>
            <span>U undo · P pause</span>
          </div>
          {state.recentPicks.length === 0 ? (
            <p className="draft-empty">No picks yet. Poll the fixture or enter one manually.</p>
          ) : (
            <ol className="recent-pick-list">
              {state.recentPicks.map((pick) => (
                <li key={pick.eventId}>
                  <span className="pick-number">{pick.overallPick}</span>
                  <span>
                    <strong>{playerName(pick.playerId, pick.playerExternalId)}</strong>
                    <small>{teamName(pick.fantasyTeamId)}</small>
                  </span>
                  <span className="recent-pick-actions">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => correctPick(pick)}
                      disabled={!selectedPlayerId || state.status === "completed"}
                    >
                      Correct
                    </button>
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={() => undoPick(pick)}
                      disabled={state.status === "completed"}
                    >
                      Undo
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="draft-rosters" aria-labelledby="draft-rosters-heading">
        <div className="draft-panel-heading">
          <div>
            <p className="section-kicker">Reduced state</p>
            <h3 id="draft-rosters-heading">Team rosters</h3>
          </div>
          <span>{state.eventCount} append-only events</span>
        </div>
        <div className="roster-grid">
          {TEAMS.map((team) => {
            const roster = state.rosters.find((candidate) => candidate.fantasyTeamId === team.id);
            return (
              <article key={team.id}>
                <h4>{team.name}</h4>
                {roster?.picks.length ? (
                  <ul>
                    {roster.picks.map((pick) => (
                      <li key={pick.eventId}>
                        <span>{playerName(pick.playerId, pick.playerExternalId)}</span>
                        <small>Pick {pick.overallPick}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No selections</p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {state.warnings.length > 0 ? (
        <aside className="draft-warning" aria-label="Draft replay warnings">
          <strong>Replay warnings</strong>
          <ul>
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}
