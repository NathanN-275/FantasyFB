import {
  generateDraftGuide,
  type DraftGuide,
  type DraftGuideInput,
  type DraftGuidePosition
} from "@fantasyfb/draft-guide";

interface SampleGuidePlayer {
  id: string;
  name: string;
  position: DraftGuidePosition;
  team: string;
  byeWeek: number;
  rank: number;
  positionRank: number;
  tier: number;
  points: number;
  floor: number;
  ceiling: number;
  confidence: number;
  risk: number;
  scarcity: number;
  adp?: number;
  history: [number, number];
  editorial?: {
    categories: ("sleeper" | "breakout" | "bust-risk" | "rookie" | "late-round")[];
    note: string;
  };
}

const samplePlayers: SampleGuidePlayer[] = [
  {
    id: "sample-marcus-vale",
    name: "Marcus Vale",
    position: "RB",
    team: "BAL",
    byeWeek: 7,
    rank: 2,
    positionRank: 1,
    tier: 1,
    points: 326.4,
    floor: 268,
    ceiling: 371,
    confidence: 0.91,
    risk: 19,
    scarcity: 0.82,
    adp: 5.8,
    history: [276.2, 311.5]
  },
  {
    id: "sample-evan-cross",
    name: "Evan Cross",
    position: "QB",
    team: "BUF",
    byeWeek: 7,
    rank: 9,
    positionRank: 1,
    tier: 2,
    points: 382.1,
    floor: 326,
    ceiling: 421,
    confidence: 0.89,
    risk: 23,
    scarcity: 0.34,
    adp: 14.2,
    history: [358.9, 376.2]
  },
  {
    id: "sample-julian-knox",
    name: "Julian Knox",
    position: "WR",
    team: "MIA",
    byeWeek: 11,
    rank: 11,
    positionRank: 3,
    tier: 2,
    points: 286.7,
    floor: 229,
    ceiling: 334,
    confidence: 0.84,
    risk: 31,
    scarcity: 0.63,
    adp: 10.6,
    history: [247.8, 281.1]
  },
  {
    id: "sample-caleb-stone",
    name: "Caleb Stone",
    position: "TE",
    team: "KC",
    byeWeek: 10,
    rank: 22,
    positionRank: 1,
    tier: 3,
    points: 234.8,
    floor: 184,
    ceiling: 278,
    confidence: 0.82,
    risk: 27,
    scarcity: 0.76,
    adp: 29.3,
    history: [201.3, 225.7]
  },
  {
    id: "sample-rowan-price",
    name: "Rowan Price",
    position: "WR",
    team: "SEA",
    byeWeek: 8,
    rank: 34,
    positionRank: 15,
    tier: 4,
    points: 226.9,
    floor: 163,
    ceiling: 284,
    confidence: 0.68,
    risk: 58,
    scarcity: 0.52,
    adp: 46.7,
    history: [181.2, 217.6],
    editorial: {
      categories: ["sleeper", "breakout"],
      note: "The synthetic editorial fixture highlights a larger projected role; the guide also requires the displayed model range and market gap."
    }
  },
  {
    id: "sample-theo-grant",
    name: "Theo Grant",
    position: "QB",
    team: "PHI",
    byeWeek: 9,
    rank: 47,
    positionRank: 8,
    tier: 5,
    points: 319.5,
    floor: 251,
    ceiling: 371,
    confidence: 0.64,
    risk: 62,
    scarcity: 0.24,
    adp: 52.4,
    history: [310.8, 298.4],
    editorial: {
      categories: ["bust-risk"],
      note: "The synthetic editorial fixture flags workload uncertainty; this is a risk label, not a prediction that the player will fail."
    }
  },
  {
    id: "sample-devin-cole",
    name: "Devin Cole",
    position: "RB",
    team: "DET",
    byeWeek: 8,
    rank: 66,
    positionRank: 26,
    tier: 6,
    points: 176.2,
    floor: 108,
    ceiling: 244,
    confidence: 0.48,
    risk: 81,
    scarcity: 0.42,
    history: [146.2, 171.8],
    editorial: {
      categories: ["bust-risk"],
      note: "The synthetic editorial fixture records an unsettled workload; missing ADP is kept explicit."
    }
  },
  {
    id: "sample-andre-bishop",
    name: "Andre Bishop",
    position: "TE",
    team: "SF",
    byeWeek: 14,
    rank: 78,
    positionRank: 10,
    tier: 7,
    points: 146.7,
    floor: 97,
    ceiling: 205,
    confidence: 0.59,
    risk: 46,
    scarcity: 0.48,
    adp: 92.1,
    history: [76.4, 113.9],
    editorial: {
      categories: ["sleeper", "breakout", "late-round"],
      note: "The synthetic editorial fixture records a possible route increase, supported here by historical growth and the model ceiling."
    }
  }
];

const input: DraftGuideInput = {
  build: {
    season: 2026,
    generatedAt: new Date("2026-07-29T12:00:00Z"),
    projectionVersion: "portfolio-model-2026.7",
    rankingVersion: "portfolio-ranking-2026.7",
    adpSnapshot: "sample-12-team-ppr-2026.12",
    scoring: {
      label: "Full PPR",
      receptionPoints: 1,
      passingTouchdownPoints: 4,
      notes: ["No tight-end premium", "Decimal scoring enabled"]
    },
    league: {
      teamCount: 12,
      rosterSize: 16,
      starters: [
        { position: "QB", count: 1 },
        { position: "RB", count: 2 },
        { position: "WR", count: 2 },
        { position: "TE", count: 1 },
        { position: "FLEX", count: 2 },
        { position: "K", count: 1 },
        { position: "DEF", count: 1 }
      ]
    }
  },
  sources: [
    {
      id: "guide-model-2026",
      label: "FantasyFB model fixture",
      kind: "model",
      datasetVersion: "sample-model-2026.7",
      retrievedAt: new Date("2026-07-23T14:30:00Z"),
      effectiveAt: new Date("2026-07-23T14:30:00Z"),
      usageNote: "Synthetic model output for portfolio demonstration.",
      isSample: true
    },
    {
      id: "guide-ranking-2026",
      label: "FantasyFB ranking fixture",
      kind: "ranking",
      datasetVersion: "sample-ranking-2026.7",
      retrievedAt: new Date("2026-07-23T14:30:00Z"),
      effectiveAt: new Date("2026-07-23T14:30:00Z"),
      usageNote: "Synthetic league-specific rankings and tiers.",
      isSample: true
    },
    {
      id: "guide-history-2025",
      label: "Historical production fixture",
      kind: "historical",
      datasetVersion: "sample-history-2025.1",
      retrievedAt: new Date("2026-02-18T15:00:00Z"),
      effectiveAt: new Date("2026-01-05T23:00:00Z"),
      usageNote: "Synthetic portfolio fixture; not real NFL statistics.",
      isSample: true
    },
    {
      id: "guide-adp-2026",
      label: "Draft market fixture",
      kind: "adp",
      datasetVersion: "sample-adp-2026.12",
      retrievedAt: new Date("2026-07-24T13:00:00Z"),
      effectiveAt: new Date("2026-07-24T13:00:00Z"),
      usageNote: "Synthetic 12-team full-PPR ADP.",
      isSample: true
    },
    {
      id: "guide-roster-2026",
      label: "Roster context fixture",
      kind: "roster",
      datasetVersion: "sample-roster-2026.3",
      retrievedAt: new Date("2026-07-24T15:00:00Z"),
      usageNote: "Synthetic team and depth-role context.",
      isSample: true
    },
    {
      id: "guide-editorial-2026",
      label: "Draft guide editorial fixture",
      kind: "editorial",
      datasetVersion: "sample-editorial-2026.2",
      retrievedAt: new Date("2026-07-25T12:00:00Z"),
      usageNote: "Clearly documented synthetic editorial inputs.",
      isSample: true
    }
  ],
  players: samplePlayers.map((player) => ({
    playerId: player.id,
    slug: player.name.toLowerCase().replaceAll(" ", "-"),
    playerName: player.name,
    position: player.position,
    team: player.team,
    byeWeek: player.byeWeek,
    model: {
      overallRank: player.rank,
      positionRank: player.positionRank,
      tier: player.tier,
      projectedPoints: player.points,
      floor: player.floor,
      ceiling: player.ceiling,
      confidence: player.confidence,
      riskScore: player.risk,
      positionalScarcity: player.scarcity,
      projectionSourceId: "guide-model-2026",
      rankingSourceId: "guide-ranking-2026"
    },
    ...(player.adp
      ? {
          adp: {
            overall: player.adp,
            sourceId: "guide-adp-2026"
          }
        }
      : {}),
    history: {
      seasons: [
        { season: 2024, fantasyPoints: player.history[0] },
        { season: 2025, fantasyPoints: player.history[1] }
      ],
      sourceId: "guide-history-2025"
    },
    rosterContext: {
      experienceYears: 3,
      depthRole: "starter",
      sourceId: "guide-roster-2026"
    },
    ...(player.editorial
      ? {
          editorial: {
            categories: player.editorial.categories,
            note: player.editorial.note,
            sourceId: "guide-editorial-2026"
          }
        }
      : {})
  }))
};

export const sampleDraftGuide: DraftGuide = generateDraftGuide(input);
