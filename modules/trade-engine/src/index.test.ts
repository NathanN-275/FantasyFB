import { describe, expect, it } from "vitest";
import { createTradeEngine } from "./index.js";

const engine = createTradeEngine();

const playerRows = [
  ["a-qb", "Avery Quarter", "QB", 310, 0.2],
  ["a-rb", "Alden Rush", "RB", 238, 0.82],
  ["a-wr", "Arlo Wide", "WR", 218, 0.58],
  ["a-te", "Atlas End", "TE", 168, 0.74],
  ["a-rb-bench", "Ash Runner", "RB", 178, 0.82],
  ["a-wr-bench", "August Split", "WR", 164, 0.58],
  ["b-qb", "Bennett Quarter", "QB", 300, 0.2],
  ["b-rb", "Blaine Rush", "RB", 220, 0.82],
  ["b-wr", "Beck Wide", "WR", 245, 0.58],
  ["b-te", "Bowie End", "TE", 192, 0.74],
  ["b-rb-bench", "Brock Runner", "RB", 184, 0.82],
  ["b-wr-bench", "Bryce Split", "WR", 176, 0.58]
] as const;

function projection(playerId: string, points: number, scoring = "league-ppr") {
  return {
    playerId,
    fullSeasonPoints: points,
    shortTermPoints: points * (3 / 17),
    floor: points * 0.8,
    ceiling: points * 1.2,
    confidence: 0.8,
    remainingGames: 17,
    scoringConfigurationIdentifier: scoring
  };
}

function baseInput() {
  return {
    league: {
      id: "league-1",
      name: "Custom League",
      teamCount: 12,
      scoringConfigurationIdentifier: "league-ppr"
    },
    rosterSettings: {
      starterSlots: [
        { name: "QB", count: 1, eligiblePositions: ["QB"] },
        { name: "RB", count: 1, eligiblePositions: ["RB"] },
        { name: "WR", count: 1, eligiblePositions: ["WR"] },
        { name: "FLEX", count: 1, eligiblePositions: ["RB", "WR", "TE"] }
      ],
      benchSlots: 2,
      injuredReserveSlots: 0
    },
    assumptions: {
      shortTermWeeks: 3,
      modelProjectionWeight: 1,
      expertProjectionWeight: 0,
      replacementLevels: { QB: 245, RB: 145, WR: 150, TE: 125, K: 95, DEF: 90 }
    },
    players: playerRows.map(([playerId, playerName, position]) => ({
      playerId,
      playerName,
      position,
      nflTeam: "SYN"
    })),
    currentRosters: [
      {
        rosterId: "roster-a",
        rosterName: "Side A",
        playerIds: ["a-qb", "a-rb", "a-wr", "a-te", "a-rb-bench", "a-wr-bench"]
      },
      {
        rosterId: "roster-b",
        rosterName: "Side B",
        playerIds: ["b-qb", "b-rb", "b-wr", "b-te", "b-rb-bench", "b-wr-bench"]
      }
    ],
    trade: {
      sideA: { rosterId: "roster-a", playerIds: ["a-rb"] },
      sideB: { rosterId: "roster-b", playerIds: ["b-wr"] }
    },
    modelProjections: playerRows.map(([playerId, , , points]) => projection(playerId, points)),
    expertProjections: [],
    rankings: playerRows.map(([playerId, , position, , scarcity], index) => ({
      playerId,
      overallRank: index + 1,
      positionRank: playerRows.slice(0, index + 1).filter((row) => row[2] === position).length,
      positionalScarcity: scarcity,
      rankingKind: "model"
    })),
    injuries: playerRows.map(([playerId]) => ({
      playerId,
      status: "healthy",
      note: null
    })),
    scheduleContext: []
  };
}

describe("TradeEngine", () => {
  it("evaluates a one-for-one through package and optimized-roster context", () => {
    const result = engine.evaluate(baseInput());

    expect(result.mode).toBe("selected-league");
    expect(result.packages.sideA.playerIds).toEqual(["a-rb"]);
    expect(result.packages.sideB.playerIds).toEqual(["b-wr"]);
    expect(result.rosterImpacts.sideA.afterStartingLineup.map((slot) => slot.playerId)).toContain(
      "b-wr"
    );
    expect(Math.abs(result.rosterImpacts.sideA.bestPlausibleOutcome)).toBeLessThan(100);
    expect(Math.abs(result.rosterImpacts.sideA.worstPlausibleOutcome)).toBeLessThan(100);
    expect(result.explanation.join(" ")).toContain("does not declare fairness");
  });

  it("models a two-for-one consolidation with a replacement and a roster drop", () => {
    const input = baseInput();
    input.trade.sideA.playerIds = ["a-rb", "a-wr-bench"];

    const result = engine.evaluate(input);

    expect(result.rosterImpacts.sideA.addedReplacementPlayers).toHaveLength(1);
    expect(result.rosterImpacts.sideB.droppedPlayerIds).toHaveLength(1);
    expect(result.rosterImpacts.sideA.packageConsolidationValue).not.toBe(0);
  });

  it("supports a three-for-two package without reducing the analysis to raw totals", () => {
    const input = baseInput();
    input.trade.sideA.playerIds = ["a-rb", "a-wr", "a-wr-bench"];
    input.trade.sideB.playerIds = ["b-wr", "b-te"];

    const result = engine.evaluate(input);

    expect(result.packages.sideA.playerIds).toHaveLength(3);
    expect(result.packages.sideB.playerIds).toHaveLength(2);
    expect(result.rosterImpacts.sideA.addedReplacementPlayers).toHaveLength(1);
    expect(result.rosterImpacts.sideB.droppedPlayerIds).toHaveLength(1);
  });

  it("keeps empty lineup slots explicit", () => {
    const input = baseInput();
    input.currentRosters[0]!.playerIds = ["a-qb", "a-rb"];
    input.currentRosters[1]!.playerIds = ["b-qb", "b-wr"];
    input.trade.sideA.playerIds = ["a-rb"];
    input.trade.sideB.playerIds = ["b-wr"];

    const result = engine.evaluate(input);

    expect(
      result.rosterImpacts.sideA.beforeStartingLineup.filter((slot) => slot.playerId === null)
    ).not.toHaveLength(0);
  });

  it("reports a bench upgrade separately from starting-lineup value", () => {
    const input = baseInput();
    input.trade.sideA.playerIds = ["a-wr-bench"];
    input.trade.sideB.playerIds = ["b-wr-bench"];

    const result = engine.evaluate(input);

    expect(result.rosterImpacts.sideA.startingLineupValue).toBe(0);
    expect(result.rosterImpacts.sideA.benchValue).toBeGreaterThan(0);
  });

  it("preserves positional scarcity in package totals", () => {
    const result = engine.evaluate(baseInput());

    expect(result.packages.sideA.positionalScarcity).toBe(0.82);
    expect(result.packages.sideB.positionalScarcity).toBe(0.58);
  });

  it("adjusts injured-player outlook and risk using disclosed factors", () => {
    const input = baseInput();
    input.injuries = input.injuries.map((injury) =>
      injury.playerId === "b-wr" ? { ...injury, status: "out" } : injury
    );

    const result = engine.evaluate(input);

    expect(result.packages.sideB.shortTermValue).toBe(0);
    expect(result.packages.sideB.rawPlayerValue).toBeLessThan(245);
    expect(result.packages.sideB.risk).toBeGreaterThan(result.packages.sideA.risk);
  });

  it("warns and uses zero rather than fabricating a missing projection", () => {
    const input = baseInput();
    input.modelProjections = input.modelProjections.filter(
      (projectionRow) => projectionRow.playerId !== "b-wr"
    );

    const result = engine.evaluate(input);

    expect(result.packages.sideB.rawPlayerValue).toBe(0);
    expect(result.missingDataWarnings.join(" ")).toContain(
      "No model projection is available for Beck Wide"
    );
  });

  it("distinguishes equal raw values with different roster effects", () => {
    const input = baseInput();
    input.rosterSettings.starterSlots = [
      { name: "QB", count: 1, eligiblePositions: ["QB"] },
      { name: "RB", count: 1, eligiblePositions: ["RB"] },
      { name: "WR", count: 2, eligiblePositions: ["WR"] }
    ];
    const aRunningBack = input.modelProjections.find((item) => item.playerId === "a-rb")!;
    const bWideReceiver = input.modelProjections.find((item) => item.playerId === "b-wr-bench")!;
    Object.assign(aRunningBack, projection("a-rb", 210));
    Object.assign(bWideReceiver, projection("b-wr-bench", 210));
    input.trade.sideA.playerIds = ["a-rb"];
    input.trade.sideB.playerIds = ["b-wr-bench"];

    const result = engine.evaluate(input);

    expect(result.packages.sideA.rawPlayerValue).toBe(result.packages.sideB.rawPlayerValue);
    expect(result.rosterImpacts.sideA.rosterContextValue).not.toBe(
      result.rosterImpacts.sideB.rosterContextValue
    );
  });

  it("accepts projections generated for a custom scoring configuration", () => {
    const input = baseInput();
    input.league.scoringConfigurationIdentifier = "custom-tight-end-premium";
    input.modelProjections = input.modelProjections.map((item) => ({
      ...item,
      fullSeasonPoints: item.playerId.endsWith("-te")
        ? item.fullSeasonPoints + 40
        : item.fullSeasonPoints,
      floor: item.playerId.endsWith("-te") ? item.floor + 32 : item.floor,
      ceiling: item.playerId.endsWith("-te") ? item.ceiling + 48 : item.ceiling,
      scoringConfigurationIdentifier: "custom-tight-end-premium"
    }));

    const result = engine.evaluate(input);

    expect(result.assumptions.scoringConfigurationIdentifier).toBe("custom-tight-end-premium");
    expect(result.missingDataWarnings.join(" ")).not.toContain("uses scoring configuration");
  });

  it("supports custom league sizes and displays them in the assumptions", () => {
    const input = baseInput();
    input.league.teamCount = 8;

    const result = engine.evaluate(input);

    expect(result.assumptions.teamCount).toBe(8);
    expect(result.assumptions.rosterSettings.starterSlots).toHaveLength(4);
  });

  it("clearly labels generic mode and displays configurable defaults", () => {
    const input = baseInput();
    delete (input as Partial<typeof input>).league;
    delete (input as Partial<typeof input>).rosterSettings;
    input.modelProjections = input.modelProjections.map((item) => ({
      ...item,
      scoringConfigurationIdentifier: "generic-full-ppr-2026"
    }));

    const result = engine.evaluate(input);

    expect(result.mode).toBe("generic");
    expect(result.assumptions.teamCount).toBe(12);
    expect(result.assumptions.replacementLevels.RB).toBeGreaterThan(0);
    expect(result.explanation[0]).toContain("Generic mode is active");
  });
});
