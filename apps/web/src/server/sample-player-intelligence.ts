import {
  createPlayerIntelligence,
  type InjuryStatus,
  type PlayerIntelligenceDataset,
  type PlayerPosition
} from "@fantasyfb/player-intelligence";

const asOf = new Date("2026-07-25T12:00:00Z");

const sources: PlayerIntelligenceDataset["sources"] = [
  {
    id: "history-2025",
    label: "2025 historical fixture",
    sourceIdentifier: "portfolio-history-fixture",
    datasetVersion: "sample-history-2025.1",
    retrievedAt: new Date("2026-02-18T15:00:00Z"),
    effectiveAt: new Date("2026-01-05T23:00:00Z"),
    staleAfterDays: 365,
    licenseOrUsageNote: "Synthetic portfolio fixture; not real NFL statistics.",
    isSample: true
  },
  {
    id: "model-2026",
    label: "FantasyFB model fixture",
    sourceIdentifier: "portfolio-model-fixture",
    datasetVersion: "sample-model-2026.7",
    retrievedAt: new Date("2026-07-23T14:30:00Z"),
    effectiveAt: new Date("2026-07-23T14:30:00Z"),
    staleAfterDays: 7,
    licenseOrUsageNote: "Synthetic model output for interface demonstration.",
    isSample: true
  },
  {
    id: "expert-2026",
    label: "Authorized expert fixture",
    sourceIdentifier: "portfolio-expert-fixture",
    datasetVersion: "sample-expert-2026.4",
    retrievedAt: new Date("2026-07-18T16:00:00Z"),
    effectiveAt: new Date("2026-07-18T16:00:00Z"),
    staleAfterDays: 14,
    licenseOrUsageNote: "Synthetic expert values; no licensed rankings are redistributed.",
    isSample: true
  },
  {
    id: "adp-2026",
    label: "Draft market fixture",
    sourceIdentifier: "portfolio-adp-fixture",
    datasetVersion: "sample-adp-2026.12",
    retrievedAt: new Date("2026-07-24T13:00:00Z"),
    effectiveAt: new Date("2026-07-24T13:00:00Z"),
    staleAfterDays: 2,
    licenseOrUsageNote: "Synthetic 12-team PPR ADP for interface demonstration.",
    isSample: true
  },
  {
    id: "news-2026",
    label: "Team report fixture",
    sourceIdentifier: "portfolio-news-fixture",
    datasetVersion: "sample-news-2026.8",
    retrievedAt: new Date("2026-07-24T18:00:00Z"),
    effectiveAt: new Date("2026-07-24T17:00:00Z"),
    staleAfterDays: 3,
    licenseOrUsageNote: "Synthetic headlines and summaries for interface demonstration.",
    isSample: true
  },
  {
    id: "stale-news-2026",
    label: "Archived camp report fixture",
    sourceIdentifier: "portfolio-stale-news-fixture",
    datasetVersion: "sample-news-2026.1",
    retrievedAt: new Date("2026-06-20T18:00:00Z"),
    effectiveAt: new Date("2026-06-20T17:00:00Z"),
    staleAfterDays: 7,
    licenseOrUsageNote: "Synthetic archived headline retained to demonstrate stale-data warnings.",
    isSample: true
  }
];

interface SamplePlayerInput {
  id: string;
  fullName: string;
  position: PlayerPosition;
  team: { id: string; abbreviation: string; name: string };
  byeWeek: number;
  injury: InjuryStatus;
  injuryDetail?: string;
  modelRank: number;
  positionRank: number;
  expertRank?: number;
  hybridRank?: number;
  adp?: number;
  positionalAdp?: number;
  projection: number;
  expertProjection?: number;
  floor: number;
  ceiling: number;
  confidence: number;
  risk: number;
  riskFactors: string[];
  history: [number, number, number];
  statistics: Record<string, number>;
  projectedStatistics: Record<string, number>;
  news?: string;
  staleNews?: boolean;
}

function samplePlayer(input: SamplePlayerInput) {
  const slug = input.fullName.toLowerCase().replaceAll(" ", "-");
  const historicalSeasons = input.history.map((fantasyPoints, index) => ({
    season: 2023 + index,
    games: index === 0 ? 16 : 17,
    fantasyPoints,
    statistics: Object.fromEntries(
      Object.entries(input.statistics).map(([key, value]) => [
        key,
        Math.max(0, Math.round(value * (0.82 + index * 0.09)))
      ])
    ),
    sourceId: "history-2025"
  }));
  const expertProjection =
    input.expertProjection === undefined
      ? []
      : [
          {
            kind: "expert" as const,
            projectedGames: 17,
            projectedStatistics: input.projectedStatistics,
            projectedPoints: input.expertProjection,
            projectedPointsPerGame: input.expertProjection / 17,
            floor: Math.min(input.floor + 3, input.expertProjection),
            median: input.expertProjection,
            ceiling: Math.max(input.ceiling - 3, input.expertProjection),
            confidence: Math.max(0.45, input.confidence - 0.08),
            sourceId: "expert-2026"
          }
        ];
  const expertRankings =
    input.expertRank === undefined
      ? []
      : [
          {
            kind: "expert" as const,
            overallRank: input.expertRank,
            positionRank: input.positionRank,
            sourceId: "expert-2026"
          }
        ];
  const hybridRankings =
    input.hybridRank === undefined
      ? []
      : [
          {
            kind: "hybrid" as const,
            overallRank: input.hybridRank,
            positionRank: input.positionRank,
            sourceId: "model-2026"
          }
        ];

  return {
    id: input.id,
    slug,
    fullName: input.fullName,
    position: input.position,
    team: input.team,
    byeWeek: input.byeWeek,
    injury: {
      status: input.injury,
      ...(input.injuryDetail ? { detail: input.injuryDetail } : {})
    },
    historicalSeasons,
    projections: [
      {
        kind: "model" as const,
        projectedGames: 17,
        projectedStatistics: input.projectedStatistics,
        projectedPoints: input.projection,
        projectedPointsPerGame: input.projection / 17,
        floor: input.floor,
        median: input.projection,
        ceiling: input.ceiling,
        confidence: input.confidence,
        sourceId: "model-2026",
        modelVersion: "portfolio-model-2026.7"
      },
      ...expertProjection
    ],
    rankings: [
      {
        kind: "model" as const,
        overallRank: input.modelRank,
        positionRank: input.positionRank,
        sourceId: "model-2026"
      },
      ...expertRankings,
      ...hybridRankings
    ],
    ...(input.adp === undefined
      ? {}
      : {
          adp: {
            overall: input.adp,
            positional: input.positionalAdp ?? input.positionRank,
            provider: "Sample 12-team PPR market",
            sourceId: "adp-2026"
          }
        }),
    risk: { score: input.risk, factors: input.riskFactors },
    news: input.news
      ? [
          {
            id: `news-${input.id}`,
            title: input.news,
            summary:
              "This synthetic report demonstrates how attributed player context appears without presenting fixture data as live news.",
            sourceUrl: `https://example.com/sample-news/${slug}`,
            publishedAt: input.staleNews
              ? new Date("2026-06-20T17:00:00Z")
              : new Date("2026-07-24T17:00:00Z"),
            sourceId: input.staleNews ? "stale-news-2026" : "news-2026"
          }
        ]
      : []
  };
}

const players = [
  samplePlayer({
    id: "sample-marcus-vale",
    fullName: "Marcus Vale",
    position: "RB",
    team: { id: "bal", abbreviation: "BAL", name: "Baltimore" },
    byeWeek: 7,
    injury: "healthy",
    modelRank: 2,
    positionRank: 1,
    expertRank: 4,
    hybridRank: 3,
    adp: 5.8,
    positionalAdp: 2,
    projection: 326.4,
    expertProjection: 309.8,
    floor: 268,
    ceiling: 371,
    confidence: 0.91,
    risk: 19,
    riskFactors: ["Stable workload", "Strong receiving role"],
    history: [238.7, 276.2, 311.5],
    statistics: { rushingYards: 1328, rushingTouchdowns: 12, receptions: 68 },
    projectedStatistics: { rushingYards: 1390, rushingTouchdowns: 13, receptions: 72 },
    news: "Vale opens camp with unchanged three-down role"
  }),
  samplePlayer({
    id: "sample-evan-cross",
    fullName: "Evan Cross",
    position: "QB",
    team: { id: "buf", abbreviation: "BUF", name: "Buffalo" },
    byeWeek: 7,
    injury: "healthy",
    modelRank: 9,
    positionRank: 1,
    expertRank: 12,
    hybridRank: 10,
    adp: 14.2,
    positionalAdp: 2,
    projection: 382.1,
    expertProjection: 371.6,
    floor: 326,
    ceiling: 421,
    confidence: 0.89,
    risk: 23,
    riskFactors: ["High weekly floor", "Rushing volume adds contact exposure"],
    history: [335.4, 358.9, 376.2],
    statistics: { passingYards: 4388, passingTouchdowns: 34, rushingYards: 548 },
    projectedStatistics: { passingYards: 4510, passingTouchdowns: 35, rushingYards: 565 },
    news: "Cross emphasizes quicker answers in red-zone install"
  }),
  samplePlayer({
    id: "sample-julian-knox",
    fullName: "Julian Knox",
    position: "WR",
    team: { id: "mia", abbreviation: "MIA", name: "Miami" },
    byeWeek: 11,
    injury: "healthy",
    modelRank: 11,
    positionRank: 3,
    expertRank: 8,
    hybridRank: 9,
    adp: 10.6,
    positionalAdp: 4,
    projection: 286.7,
    expertProjection: 297.4,
    floor: 229,
    ceiling: 334,
    confidence: 0.84,
    risk: 31,
    riskFactors: ["Volatile deep targets", "Elite route participation"],
    history: [214.6, 247.8, 281.1],
    statistics: { receptions: 91, receivingYards: 1384, receivingTouchdowns: 10 },
    projectedStatistics: { receptions: 94, receivingYards: 1410, receivingTouchdowns: 9 },
    news: "Knox moves across formations during camp opener"
  }),
  samplePlayer({
    id: "sample-caleb-stone",
    fullName: "Caleb Stone",
    position: "TE",
    team: { id: "kc", abbreviation: "KC", name: "Kansas City" },
    byeWeek: 10,
    injury: "healthy",
    modelRank: 22,
    positionRank: 1,
    expertRank: 25,
    hybridRank: 23,
    adp: 29.3,
    positionalAdp: 2,
    projection: 234.8,
    expertProjection: 226.5,
    floor: 184,
    ceiling: 278,
    confidence: 0.82,
    risk: 27,
    riskFactors: ["Premium route rate", "Position-level touchdown variance"],
    history: [174.5, 201.3, 225.7],
    statistics: { receptions: 82, receivingYards: 934, receivingTouchdowns: 8 },
    projectedStatistics: { receptions: 86, receivingYards: 978, receivingTouchdowns: 8 },
    news: "Stone remains featured in condensed formations"
  }),
  samplePlayer({
    id: "sample-rowan-price",
    fullName: "Rowan Price",
    position: "WR",
    team: { id: "sea", abbreviation: "SEA", name: "Seattle" },
    byeWeek: 8,
    injury: "questionable",
    injuryDetail: "Synthetic camp maintenance designation",
    modelRank: 34,
    positionRank: 15,
    expertRank: 42,
    hybridRank: 37,
    adp: 46.7,
    positionalAdp: 21,
    projection: 226.9,
    expertProjection: 211.3,
    floor: 163,
    ceiling: 284,
    confidence: 0.68,
    risk: 58,
    riskFactors: ["New offensive system", "Current maintenance designation"],
    history: [132.8, 181.2, 217.6],
    statistics: { receptions: 72, receivingYards: 1048, receivingTouchdowns: 7 },
    projectedStatistics: { receptions: 76, receivingYards: 1095, receivingTouchdowns: 7 },
    news: "Price held to individual work in archived camp note",
    staleNews: true
  }),
  samplePlayer({
    id: "sample-theo-grant",
    fullName: "Theo Grant",
    position: "QB",
    team: { id: "phi", abbreviation: "PHI", name: "Philadelphia" },
    byeWeek: 9,
    injury: "questionable",
    injuryDetail: "Synthetic shoulder soreness",
    modelRank: 47,
    positionRank: 8,
    expertRank: 39,
    hybridRank: 43,
    adp: 52.4,
    positionalAdp: 9,
    projection: 319.5,
    expertProjection: 328.9,
    floor: 251,
    ceiling: 371,
    confidence: 0.64,
    risk: 62,
    riskFactors: ["Shoulder workload monitoring", "New play caller"],
    history: [287.2, 310.8, 298.4],
    statistics: { passingYards: 3792, passingTouchdowns: 27, rushingYards: 412 },
    projectedStatistics: { passingYards: 3920, passingTouchdowns: 28, rushingYards: 430 },
    news: "Grant expected to resume full throwing workload"
  }),
  samplePlayer({
    id: "sample-devin-cole",
    fullName: "Devin Cole",
    position: "RB",
    team: { id: "det", abbreviation: "DET", name: "Detroit" },
    byeWeek: 8,
    injury: "out",
    injuryDetail: "Synthetic preseason ankle sprain",
    modelRank: 66,
    positionRank: 26,
    projection: 176.2,
    floor: 108,
    ceiling: 244,
    confidence: 0.48,
    risk: 81,
    riskFactors: ["Active injury designation", "Unsettled workload split"],
    history: [88.4, 146.2, 171.8],
    statistics: { rushingYards: 704, rushingTouchdowns: 5, receptions: 31 },
    projectedStatistics: { rushingYards: 748, rushingTouchdowns: 6, receptions: 34 }
  }),
  samplePlayer({
    id: "sample-andre-bishop",
    fullName: "Andre Bishop",
    position: "TE",
    team: { id: "sf", abbreviation: "SF", name: "San Francisco" },
    byeWeek: 14,
    injury: "healthy",
    modelRank: 78,
    positionRank: 10,
    expertRank: 83,
    adp: 92.1,
    positionalAdp: 12,
    projection: 146.7,
    expertProjection: 139.2,
    floor: 97,
    ceiling: 205,
    confidence: 0.59,
    risk: 46,
    riskFactors: ["Expanded route projection", "Limited prior-year sample"],
    history: [38.7, 76.4, 113.9],
    statistics: { receptions: 43, receivingYards: 518, receivingTouchdowns: 4 },
    projectedStatistics: { receptions: 52, receivingYards: 624, receivingTouchdowns: 5 },
    news: "Bishop earns first-team work in two-tight-end sets"
  })
];

const sampleDataset = {
  season: 2026,
  asOf,
  label: "PUBLIC DEMO · SYNTHETIC SAMPLE DATA",
  sources,
  players
} satisfies PlayerIntelligenceDataset;

export const samplePlayerIntelligence = createPlayerIntelligence(sampleDataset);
