import { describe, expect, it } from "vitest";
import {
  createPlayerIntelligence,
  playerIntelligenceDatasetSchema,
  type PlayerIntelligenceDataset
} from "./index.js";

const dataset: PlayerIntelligenceDataset = {
  season: 2026,
  asOf: new Date("2026-07-25T12:00:00Z"),
  label: "TEST SAMPLE DATA",
  sources: [
    {
      id: "history",
      label: "Historical fixture",
      sourceIdentifier: "history-test",
      datasetVersion: "v1",
      retrievedAt: new Date("2026-07-24T12:00:00Z"),
      staleAfterDays: 30,
      licenseOrUsageNote: "Test fixture.",
      isSample: true
    },
    {
      id: "model",
      label: "Model fixture",
      sourceIdentifier: "model-test",
      datasetVersion: "v2",
      retrievedAt: new Date("2026-07-23T12:00:00Z"),
      staleAfterDays: 7,
      licenseOrUsageNote: "Test fixture.",
      isSample: true
    },
    {
      id: "expert",
      label: "Expert fixture",
      sourceIdentifier: "expert-test",
      datasetVersion: "v3",
      retrievedAt: new Date("2026-06-01T12:00:00Z"),
      staleAfterDays: 14,
      licenseOrUsageNote: "Test fixture.",
      isSample: true
    },
    {
      id: "adp",
      label: "ADP fixture",
      sourceIdentifier: "adp-test",
      datasetVersion: "v4",
      retrievedAt: new Date("2026-07-25T12:00:00Z"),
      staleAfterDays: 2,
      licenseOrUsageNote: "Test fixture.",
      isSample: true
    }
  ],
  players: [
    {
      id: "player-1",
      slug: "ada-stone",
      fullName: "Ada Stone",
      position: "WR",
      team: { id: "sea", abbreviation: "SEA", name: "Seattle" },
      byeWeek: 8,
      injury: { status: "healthy" },
      historicalSeasons: [
        {
          season: 2025,
          games: 17,
          fantasyPoints: 278,
          statistics: { receptions: 96, receivingYards: 1280 },
          sourceId: "history"
        }
      ],
      projections: [
        {
          kind: "model",
          projectedGames: 17,
          projectedStatistics: { receptions: 101 },
          projectedPoints: 286,
          projectedPointsPerGame: 16.82,
          floor: 242,
          median: 286,
          ceiling: 328,
          confidence: 0.88,
          sourceId: "model",
          modelVersion: "model-v2"
        },
        {
          kind: "expert",
          projectedGames: 17,
          projectedStatistics: { receptions: 95 },
          projectedPoints: 272,
          projectedPointsPerGame: 16,
          floor: 235,
          median: 272,
          ceiling: 310,
          confidence: 0.72,
          sourceId: "expert"
        }
      ],
      rankings: [
        { kind: "model", overallRank: 8, positionRank: 4, sourceId: "model" },
        { kind: "expert", overallRank: 11, positionRank: 5, sourceId: "expert" },
        { kind: "hybrid", overallRank: 9, positionRank: 4, sourceId: "model" }
      ],
      adp: { overall: 13.5, positional: 6, provider: "Fixture ADP", sourceId: "adp" },
      risk: { score: 24, factors: ["Stable target share"] },
      news: []
    },
    {
      id: "player-2",
      slug: "ben-north",
      fullName: "Ben North",
      position: "RB",
      team: { id: "chi", abbreviation: "CHI", name: "Chicago" },
      byeWeek: 5,
      injury: { status: "questionable", detail: "Sample hamstring note" },
      historicalSeasons: [],
      projections: [
        {
          kind: "model",
          projectedGames: 15,
          projectedStatistics: { rushingYards: 990 },
          projectedPoints: 232,
          projectedPointsPerGame: 15.47,
          floor: 172,
          median: 232,
          ceiling: 294,
          confidence: 0.61,
          sourceId: "model",
          modelVersion: "model-v2"
        }
      ],
      rankings: [{ kind: "model", overallRank: 25, positionRank: 12, sourceId: "model" }],
      risk: { score: 74, factors: ["Recent soft-tissue injury"] },
      news: []
    }
  ]
};

describe("PlayerIntelligence", () => {
  it("returns one normalized evaluation with comparisons, risk, freshness, and gaps", () => {
    const profile = createPlayerIntelligence(dataset).profile("ada-stone");

    expect(profile).toMatchObject({
      fullName: "Ada Stone",
      confidence: 0.88,
      risk: { level: "low" },
      comparisons: {
        modelVersusExpertPoints: 14,
        modelVersusExpertRank: 3,
        modelVersusAdp: 5.5
      },
      dataHealth: {
        state: "stale",
        missing: ["news"]
      }
    });
    expect(profile?.sources.find((source) => source.id === "expert")).toMatchObject({
      freshness: "stale",
      ageInDays: 54
    });
  });

  it("filters across search, position, team, bye, ranking, and injury fields", () => {
    const intelligence = createPlayerIntelligence(dataset);

    expect(
      intelligence.directory({
        search: "seattle",
        positions: ["WR"],
        teams: ["SEA"],
        byeWeeks: [8],
        rankingKinds: ["hybrid"],
        injuryStatuses: ["healthy"]
      }).players
    ).toHaveLength(1);
    expect(
      intelligence.directory({
        positions: ["WR"],
        injuryStatuses: ["questionable"]
      }).players
    ).toHaveLength(0);
  });

  it("sorts missing values after available values in either direction", () => {
    const intelligence = createPlayerIntelligence(dataset);

    expect(
      intelligence.directory({ sort: "adp", direction: "asc" }).players.map((player) => player.id)
    ).toEqual(["player-1", "player-2"]);
    expect(
      intelligence.directory({ sort: "adp", direction: "desc" }).players.map((player) => player.id)
    ).toEqual(["player-1", "player-2"]);
  });

  it("uses lower-is-better defaults for ranks and higher-is-better defaults for projections", () => {
    const intelligence = createPlayerIntelligence(dataset);

    expect(
      intelligence.directory({ sort: "modelRank" }).players.map((player) => player.id)
    ).toEqual(["player-1", "player-2"]);
    expect(
      intelligence.directory({ sort: "projection" }).players.map((player) => player.id)
    ).toEqual(["player-1", "player-2"]);
  });

  it("reports partial data without fabricating optional provider values", () => {
    const profile = createPlayerIntelligence(dataset).profile("player-2");

    expect(profile?.dataHealth).toMatchObject({
      state: "partial",
      missing: [
        "historical statistics",
        "expert projection",
        "expert rank",
        "hybrid rank",
        "ADP",
        "news"
      ]
    });
    expect(profile?.adp).toBeUndefined();
    expect(profile?.comparisons).toEqual({});
  });

  it("rejects records that reference unknown provenance", () => {
    const invalid = structuredClone(dataset);
    invalid.players![0]!.projections![0]!.sourceId = "unknown";

    expect(() => playerIntelligenceDatasetSchema.parse(invalid)).toThrow(/unknown source/);
  });

  it("rejects ambiguous duplicate signal kinds and future provenance", () => {
    const duplicated = structuredClone(dataset);
    duplicated.players![0]!.rankings!.push({
      ...duplicated.players![0]!.rankings![0]!,
      overallRank: 99
    });
    expect(() => playerIntelligenceDatasetSchema.parse(duplicated)).toThrow(
      /Duplicate ranking kind/
    );

    const future = structuredClone(dataset);
    future.sources![0]!.retrievedAt = new Date("2026-07-26T12:00:00Z");
    expect(() => playerIntelligenceDatasetSchema.parse(future)).toThrow(
      /cannot be retrieved after/
    );
  });
});
