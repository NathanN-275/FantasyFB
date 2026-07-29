import type { TradeEngineInput } from "@fantasyfb/trade-engine";

const PLAYERS = [
  ["north-qb", "Mason North", "QB", 318, 0.26],
  ["north-rb", "Jalen Cross", "RB", 246, 0.84],
  ["north-wr", "Roman Ellis", "WR", 224, 0.6],
  ["north-te", "Kai Mercer", "TE", 176, 0.76],
  ["north-rb-depth", "Drew Banks", "RB", 181, 0.84],
  ["north-wr-depth", "Owen Hart", "WR", 166, 0.6],
  ["south-qb", "Cole Archer", "QB", 306, 0.26],
  ["south-rb", "Nico Fields", "RB", 226, 0.84],
  ["south-wr", "Micah Lane", "WR", 252, 0.6],
  ["south-te", "Evan Rhodes", "TE", 198, 0.76],
  ["south-rb-depth", "Trey Vaughn", "RB", 188, 0.84],
  ["south-wr-depth", "Isaiah West", "WR", 179, 0.6]
] as const;

/**
 * Synthetic, provider-neutral inputs for public and private-workflow demonstrations.
 * No player, roster, projection, or injury record represents a real person or league.
 */
export const TRADE_DEMO_INPUT: TradeEngineInput = {
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
  players: PLAYERS.map(([playerId, playerName, position]) => ({
    playerId,
    playerName,
    position,
    nflTeam: "SYN"
  })),
  currentRosters: [
    {
      rosterId: "north-roster",
      rosterName: "North Harbor",
      playerIds: [
        "north-qb",
        "north-rb",
        "north-wr",
        "north-te",
        "north-rb-depth",
        "north-wr-depth"
      ]
    },
    {
      rosterId: "south-roster",
      rosterName: "South Market",
      playerIds: [
        "south-qb",
        "south-rb",
        "south-wr",
        "south-te",
        "south-rb-depth",
        "south-wr-depth"
      ]
    }
  ],
  trade: {
    sideA: { rosterId: "north-roster", playerIds: ["north-rb"] },
    sideB: { rosterId: "south-roster", playerIds: ["south-wr"] }
  },
  modelProjections: PLAYERS.map(([playerId, , , points]) => ({
    playerId,
    fullSeasonPoints: points,
    shortTermPoints: Number((points * (3 / 17)).toFixed(2)),
    floor: points * 0.8,
    ceiling: points * 1.2,
    confidence: 0.8,
    remainingGames: 17,
    scoringConfigurationIdentifier: "generic-full-ppr-2026"
  })),
  expertProjections: [],
  rankings: PLAYERS.map(([playerId, , position, , scarcity], index) => ({
    playerId,
    overallRank: index + 1,
    positionRank: PLAYERS.slice(0, index + 1).filter((row) => row[2] === position).length,
    positionalScarcity: scarcity,
    rankingKind: "model"
  })),
  injuries: PLAYERS.map(([playerId]) => ({
    playerId,
    status: playerId === "south-te" ? "questionable" : "healthy",
    note: playerId === "south-te" ? "Synthetic questionable designation for demo behavior." : null
  })),
  scheduleContext: [
    {
      playerId: "north-rb",
      shortTermFactor: 1.04,
      fullSeasonFactor: 1,
      note: "Synthetic favorable three-week schedule factor."
    },
    {
      playerId: "south-wr",
      shortTermFactor: 0.96,
      fullSeasonFactor: 1,
      note: "Synthetic difficult three-week schedule factor."
    }
  ]
};
