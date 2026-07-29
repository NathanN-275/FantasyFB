import { describe, expect, it } from "vitest";
import {
  createDraftRecommendationEngine,
  createSleeperPollingSource,
  draftEventSchema,
  replayDraftEvents,
  type DraftRecommendationInput
} from "./index.js";

const players = [
  {
    playerId: "rb-1",
    playerName: "Atlas Runner",
    position: "RB",
    nflTeam: "ATL",
    byeWeek: 12,
    projectedPoints: 260,
    modelRank: 1,
    expertRank: 2,
    hybridRank: 1,
    overallTier: 1,
    positionTier: 1,
    valueOverReplacement: 85,
    positionalScarcity: 0.82,
    adp: 3,
    floor: 220,
    ceiling: 310,
    risk: 0.24,
    confidence: 0.86
  },
  {
    playerId: "wr-1",
    playerName: "Boundary Catcher",
    position: "WR",
    nflTeam: "BUF",
    byeWeek: 7,
    projectedPoints: 250,
    modelRank: 2,
    expertRank: 1,
    hybridRank: 2,
    overallTier: 1,
    positionTier: 1,
    valueOverReplacement: 78,
    positionalScarcity: 0.68,
    adp: 1,
    floor: 225,
    ceiling: 285,
    risk: 0.12,
    confidence: 0.91
  },
  {
    playerId: "wr-2",
    playerName: "Vertical Receiver",
    position: "WR",
    nflTeam: "SEA",
    byeWeek: 8,
    projectedPoints: 235,
    modelRank: 3,
    expertRank: 4,
    hybridRank: 3,
    overallTier: 2,
    positionTier: 2,
    valueOverReplacement: 61,
    positionalScarcity: 0.68,
    adp: 8,
    floor: 170,
    ceiling: 325,
    risk: 0.49,
    confidence: 0.67
  },
  {
    playerId: "qb-1",
    playerName: "Pocket Captain",
    position: "QB",
    nflTeam: "HOU",
    byeWeek: 6,
    projectedPoints: 310,
    modelRank: 4,
    expertRank: 3,
    hybridRank: 4,
    overallTier: 2,
    positionTier: 1,
    valueOverReplacement: 55,
    positionalScarcity: 0.42,
    adp: 5,
    floor: 270,
    ceiling: 350,
    risk: 0.18,
    confidence: 0.88
  },
  {
    playerId: "te-1",
    playerName: "Seam Target",
    position: "TE",
    nflTeam: "LAC",
    byeWeek: 5,
    projectedPoints: 205,
    modelRank: 5,
    expertRank: 5,
    hybridRank: 5,
    overallTier: 3,
    positionTier: 1,
    valueOverReplacement: 40,
    positionalScarcity: 0.74,
    adp: 6,
    floor: 165,
    ceiling: 260,
    risk: 0.3,
    confidence: 0.8
  }
] as const;

function baseInput(): DraftRecommendationInput {
  return {
    draftState: {
      draftId: "draft-1",
      status: "in_progress",
      picks: [
        {
          eventId: "keeper-1",
          source: "manual",
          sequence: 1,
          overallPick: 1,
          round: 1,
          draftSlot: 1,
          fantasyTeamId: "team-1",
          playerId: "rb-1",
          keeperStatus: "keeper"
        }
      ],
      recentPicks: [],
      rosters: [],
      draftedPlayerIds: ["rb-1"],
      unresolvedPlayerExternalIds: [],
      eventCount: 1,
      lastSequence: 1,
      warnings: []
    },
    players: [...players],
    league: {
      teamIds: ["team-1", "team-2", "team-3", "team-4"],
      userTeamId: "team-1",
      draftSlot: 1,
      rounds: 4,
      currentOverallPick: 2,
      thirdRoundReversal: false,
      tradedPickOwners: {},
      scoringConfigurationIdentifier: "custom-ppr-v1",
      startingLineup: [
        { name: "QB", count: 1, eligiblePositions: ["QB"] },
        { name: "RB", count: 1, eligiblePositions: ["RB"] },
        { name: "WR", count: 2, eligiblePositions: ["WR"] }
      ],
      benchSlots: 2
    },
    mode: "manual",
    synchronization: {
      state: "live",
      detail: "Manual entries are current.",
      checkedAt: "2026-07-28T20:00:00.000Z"
    },
    sourceFreshness: {
      projections: "fresh",
      rankings: "fresh",
      adp: "fresh"
    },
    preferences: {
      rankingSource: "hybrid",
      riskTolerance: "balanced",
      preferredPlayerIds: [],
      avoidedPlayerIds: [],
      preferredPositions: []
    },
    availabilityOutcomes: []
  };
}

describe("DraftRecommendationEngine", () => {
  it("returns six explained strategies without recommending drafted keepers", () => {
    const result = createDraftRecommendationEngine().recommend(baseInput());

    expect(result.recommendations.map((recommendation) => recommendation.strategy)).toEqual([
      "best-overall-value",
      "safest-selection",
      "highest-upside",
      "positional-need",
      "tier-protection",
      "contrarian-selection"
    ]);
    expect(
      result.recommendations.every(
        (recommendation) =>
          recommendation.player.playerId !== "rb-1" &&
          recommendation.ranking.rank > 0 &&
          recommendation.positionalNeed.explanation.length > 0 &&
          recommendation.tier.explanation.length > 0 &&
          recommendation.expectedAvailability.explanation.length > 0 &&
          recommendation.rosterEffect.includes("bye week") &&
          recommendation.risk.explanation.length > 0 &&
          recommendation.explanation.length > 0
      )
    ).toBe(true);
    expect(
      result.recommendations.every((recommendation) =>
        recommendation.explanation.some((reason) => reason.includes("tier"))
      )
    ).toBe(true);
    expect(
      result.recommendations.every((recommendation) =>
        recommendation.explanation.some((reason) => reason.includes("ADP"))
      )
    ).toBe(true);
    expect(result.recommendations[0]?.expectedAvailability.targetOverallPick).toBe(8);
  });

  it("uses third-round reversal and traded ownership for the next-pick forecast", () => {
    const input = baseInput();
    input.league.currentOverallPick = 1;
    input.league.thirdRoundReversal = true;
    input.league.tradedPickOwners = { "8": "team-2" };

    const result = createDraftRecommendationEngine().recommend(input);

    expect(result.forecast).toEqual({
      currentOverallPick: 1,
      currentOwnerTeamId: "team-1",
      nextUserPick: 1,
      followingUserPick: 12,
      picksUntilNextUserPick: 0,
      format: "third-round-reversal"
    });
  });

  it("evaluates the interpretable availability model with simulated outcomes", () => {
    const input = baseInput();
    input.availabilityOutcomes = [
      { playerId: "wr-1", targetOverallPick: 4, wasAvailable: false },
      { playerId: "wr-2", targetOverallPick: 4, wasAvailable: true },
      { playerId: "qb-1", targetOverallPick: 5, wasAvailable: true }
    ];

    const result = createDraftRecommendationEngine().recommend(input);

    expect(result.availabilityModel).toMatchObject({
      evaluatedSamples: 3,
      brierScore: expect.any(Number)
    });
    expect(result.availabilityModel.formula).toContain("logistic");
    expect(
      result.recommendations.every((recommendation) =>
        recommendation.expectedAvailability.explanation.includes("not a guarantee")
      )
    ).toBe(true);
  });

  it("falls back to explicitly labeled model ranks when expert data is missing", () => {
    const input = baseInput();
    input.preferences.rankingSource = "expert";
    input.players = input.players.map((player) => ({ ...player, expertRank: null }));
    input.sourceFreshness.rankings = "unavailable";

    const result = createDraftRecommendationEngine().recommend(input);

    expect(result.recommendations.every(({ ranking }) => ranking.source === "model")).toBe(true);
    expect(result.warnings).toContain(
      "Expert rankings are unavailable; recommendations use Model Rank and do not relabel it."
    );
    expect(result.warnings).toContain("rankings source is unavailable.");
  });

  it("honors unusual starter demand, custom scoring metadata, and Sleeper mode", () => {
    const input = baseInput();
    input.draftState.picks[0]!.fantasyTeamId = "team-2";
    input.mode = "sleeper";
    input.league.scoringConfigurationIdentifier = "superflex-tight-end-premium-v2";
    input.league.startingLineup = [
      { name: "SUPERFLEX", count: 1, eligiblePositions: ["QB", "RB"] },
      { name: "TE PREMIUM", count: 2, eligiblePositions: ["TE"] }
    ];

    const result = createDraftRecommendationEngine().recommend(input);
    const needRecommendation = result.recommendations.find(
      ({ strategy }) => strategy === "positional-need"
    );

    expect(result.mode).toBe("sleeper");
    expect(result.rosterNeeds.find(({ position }) => position === "QB")).toMatchObject({
      targetStarterCount: 1,
      urgency: 0.33
    });
    expect(result.rosterNeeds.find(({ position }) => position === "TE")).toMatchObject({
      targetStarterCount: 2,
      urgency: 0.67
    });
    expect(needRecommendation?.player.position).toBe("TE");
    expect(needRecommendation?.rosterEffect).toContain("superflex-tight-end-premium-v2");
  });

  it("forecasts a custom six-team snake draft without fixed league-size assumptions", () => {
    const input = baseInput();
    input.league.teamIds = ["team-1", "team-2", "team-3", "team-4", "team-5", "team-6"];
    input.league.rounds = 3;

    const result = createDraftRecommendationEngine().recommend(input);

    expect(result.forecast).toMatchObject({
      currentOverallPick: 2,
      nextUserPick: 12,
      followingUserPick: 13,
      format: "snake"
    });
  });

  it("recommends from Sleeper-normalized reduced draft state", async () => {
    const source = createSleeperPollingSource("draft-1", {
      fetch: async () =>
        Response.json([
          {
            draft_id: "draft-1",
            pick_no: 1,
            round: 1,
            draft_slot: 1,
            roster_id: 1,
            player_id: "external-rb-1"
          }
        ]),
      now: () => new Date("2026-07-28T20:00:00.000Z")
    });
    const initialState = replayDraftEvents([], "draft-1");
    const poll = await source.poll({ draftId: "draft-1", currentState: initialState });
    const state = replayDraftEvents(
      [
        draftEventSchema.parse({
          ...poll.events[0],
          sequence: 1,
          receivedAt: "2026-07-28T20:00:00.000Z"
        }),
        draftEventSchema.parse({
          eventId: "mapping-1",
          draftId: "draft-1",
          source: "sleeper",
          sequence: 2,
          eventType: "player_mapping_resolved",
          playerId: "rb-1",
          playerExternalId: "external-rb-1",
          receivedAt: "2026-07-28T20:00:01.000Z"
        })
      ],
      "draft-1"
    );
    const input = { ...baseInput(), draftState: state, mode: "sleeper" as const };

    const result = createDraftRecommendationEngine().recommend(input);

    expect(state.draftedPlayerIds).toContain("rb-1");
    expect(result.mode).toBe("sleeper");
    expect(result.recommendations.every(({ player }) => player.playerId !== "rb-1")).toBe(true);
  });
});
