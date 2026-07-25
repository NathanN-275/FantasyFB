import { describe, expect, it, vi } from "vitest";
import {
  AuthorizedExpertApiProvider,
  createExpertDisplayState,
  FantasyFootballCalculatorAdpProvider,
  NoExpertDataProvider,
  PrivateCsvExpertProvider,
  type CsvImportProfile
} from "./index.js";

const profile: CsvImportProfile = {
  kind: "combined",
  columns: {
    fullName: "Player",
    team: "Team",
    position: "Pos",
    overallRank: "Rank",
    projectedPoints: "Points",
    statistics: { receptions: "Rec" }
  }
};

describe("expert providers", () => {
  it("keeps the authorized API disabled without both an HTTPS endpoint and token", async () => {
    const provider = new AuthorizedExpertApiProvider({
      providerName: "licensed-provider",
      endpoint: "http://example.com",
      token: "secret"
    });
    expect(provider.status()).toMatchObject({ enabled: false });
    await expect(provider.load({ season: 2026 })).resolves.toMatchObject({
      projections: [],
      rankings: [],
      unavailableReason: expect.any(String)
    });
  });

  it("validates and normalizes an authorized expert response", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            projections: [{ fullName: "A Player", projectedPoints: 250, statistics: {} }],
            rankings: [{ fullName: "A Player", overallRank: 1 }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const provider = new AuthorizedExpertApiProvider({
      providerName: "licensed-provider",
      endpoint: "https://licensed.example/api",
      token: "secret",
      fetch: fetch as typeof globalThis.fetch,
      clock: () => new Date("2026-07-25T12:00:00Z")
    });
    await expect(provider.load({ season: 2026 })).resolves.toMatchObject({
      provider: "licensed-provider",
      season: 2026,
      projections: [{ projectedPoints: 250 }],
      rankings: [{ overallRank: 1 }]
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://licensed.example/api?season=2026"),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret" })
      })
    );
  });

  it("parses quoted CSV fields and reports matched, ambiguous, missing, and invalid players", () => {
    const provider = new PrivateCsvExpertProvider();
    const preview = provider.preview({
      fileName: "experts.csv",
      contentType: "text/csv",
      contents:
        'Player,Team,Pos,Rank,Points,Rec\n"Doe, John",NYJ,WR,3,210.5,80\nAlex Smith,,QB,4,200,0\nMissing Player,FA,RB,5,100,20\nBad Rank,DAL,WR,x,90,10',
      profile,
      players: [
        {
          id: "john",
          fullName: "Doe, John",
          team: "NYJ",
          position: "WR",
          externalIds: []
        },
        {
          id: "alex-one",
          fullName: "Alex Smith",
          team: "KC",
          position: "QB",
          externalIds: []
        },
        {
          id: "alex-two",
          fullName: "Alex Smith",
          team: "SF",
          position: "QB",
          externalIds: []
        }
      ]
    });
    expect(preview).toMatchObject({
      totalRows: 4,
      matchedRows: 1,
      ambiguousRows: 1,
      missingRows: 1,
      invalidRows: 1
    });
    expect(preview.rows[0]).toMatchObject({
      playerId: "john",
      ranking: { overallRank: 3 },
      projection: { projectedPoints: 210.5, statistics: { receptions: 80 } }
    });
  });

  it("rejects unsupported and oversized private imports", () => {
    const provider = new PrivateCsvExpertProvider();
    const input = {
      fileName: "experts.txt",
      contentType: "text/plain",
      contents: "Player,Rank\nOne,1",
      profile: { kind: "ranking", columns: { fullName: "Player", overallRank: "Rank" } } as const,
      players: []
    };
    expect(() => provider.preview(input)).toThrow("Only .csv files");
  });

  it("hides expert fields while preserving model fields when no provider exists", async () => {
    const dataset = await new NoExpertDataProvider().load({ season: 2026 });
    expect(createExpertDisplayState(dataset)).toEqual({
      showModelRank: true,
      showModelProjection: true,
      showExpertRank: false,
      showExpertProjection: false,
      explanation: "No authorized expert data provider is configured."
    });
  });

  it("explains a partially available expert dataset", () => {
    expect(
      createExpertDisplayState({
        provider: "licensed-provider",
        season: 2026,
        retrievedAt: new Date("2026-07-25T12:00:00Z"),
        projections: [],
        rankings: [{ fullName: "A Player", overallRank: 1 }]
      })
    ).toMatchObject({
      showModelRank: true,
      showModelProjection: true,
      showExpertRank: true,
      showExpertProjection: false,
      explanation: "Expert projections are unavailable from the active provider."
    });
  });
});

describe("Fantasy Football Calculator ADP provider", () => {
  it("normalizes provider data and derives positional ADP without overwriting snapshots", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "Success",
            meta: { total_drafts: 100 },
            players: [
              {
                player_id: 10,
                name: "Wide Receiver",
                position: "WR",
                team: "NYJ",
                adp: 2.5,
                times_drafted: 75,
                high: 1,
                low: 8
              },
              {
                player_id: 11,
                name: "Running Back",
                position: "RB",
                team: "BUF",
                adp: 1.5,
                times_drafted: 80,
                high: 1,
                low: 5
              },
              {
                player_id: 12,
                name: "Second Receiver",
                position: "WR",
                team: "MIA",
                adp: 3.5
              }
            ]
          }),
          { status: 200 }
        )
    );
    const provider = new FantasyFootballCalculatorAdpProvider({
      fetch: fetch as typeof globalThis.fetch,
      clock: () => new Date("2026-07-25T12:00:00Z")
    });
    const dataset = await provider.load({ season: 2026, scoringFormat: "ppr", leagueSize: 12 });
    expect(dataset).toMatchObject({
      provider: "fantasy-football-calculator",
      totalDrafts: 100,
      records: [
        { providerPlayerId: "11", overallAdp: 1.5, positionalAdp: 1 },
        {
          providerPlayerId: "10",
          overallAdp: 2.5,
          positionalAdp: 1,
          minimumPick: 1,
          maximumPick: 8,
          sampleSize: 75
        },
        { providerPlayerId: "12", overallAdp: 3.5, positionalAdp: 2 }
      ]
    });
  });
});
