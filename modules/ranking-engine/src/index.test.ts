import { SCORING_PRESETS, type ScoringRules } from "@fantasyfb/fantasy-core";
import { describe, expect, it } from "vitest";
import { createRankingEngine, type RankingEngineInput } from "./index.js";

const scoringIdentifier = "full-ppr-v1";

function player(
  playerId: string,
  position: RankingEngineInput["modelProjections"][number]["position"],
  projectedPoints: number,
  overrides: Partial<RankingEngineInput["modelProjections"][number]> = {}
): RankingEngineInput["modelProjections"][number] {
  return {
    playerId,
    playerName: playerId.toUpperCase(),
    position,
    projectedPoints,
    floor: Math.max(0, projectedPoints - 30),
    ceiling: projectedPoints + 30,
    confidence: 0.8,
    scoringConfigurationIdentifier: scoringIdentifier,
    externalIds: [],
    ...overrides
  };
}

function baseInput(
  modelProjections: RankingEngineInput["modelProjections"],
  overrides: Partial<RankingEngineInput> = {}
): RankingEngineInput {
  return {
    modelProjections,
    expertProjections: [],
    expertRankings: [],
    scoring: {
      configurationIdentifier: scoringIdentifier,
      rules: SCORING_PRESETS.fullPpr
    },
    leagueSize: 2,
    rosterConfiguration: {
      totalRosterSlotsPerTeam: 6,
      benchSlotsPerTeam: 2,
      injuredReserveSlotsPerTeam: 0
    },
    startingLineupConfiguration: {
      slots: [
        { name: "RB", count: 1, eligiblePositions: ["RB"] },
        { name: "WR", count: 1, eligiblePositions: ["WR"] },
        { name: "FLEX", count: 1, eligiblePositions: ["RB", "WR", "TE"] }
      ]
    },
    replacementLevelAssumptions: {
      benchAllocationByPosition: { RB: 1, WR: 1 },
      rankOverridesByPosition: {},
      projectedPointOverridesByPosition: {}
    },
    ...overrides
  };
}

describe("RankingEngine", () => {
  it("returns the complete explainable ranking, tier, uncertainty, and market-value output", () => {
    const result = createRankingEngine().rank(
      baseInput(
        [
          player("rb-a", "RB", 250),
          player("rb-b", "RB", 210),
          player("wr-a", "WR", 240),
          player("wr-b", "WR", 200)
        ],
        {
          expertProjections: [
            {
              playerId: "rb-a",
              projectedPoints: 245,
              confidence: 0.7,
              scoringConfigurationIdentifier: scoringIdentifier,
              provider: "licensed"
            },
            {
              playerId: "rb-b",
              projectedPoints: 205,
              scoringConfigurationIdentifier: scoringIdentifier,
              provider: "licensed"
            },
            {
              playerId: "wr-a",
              projectedPoints: 255,
              scoringConfigurationIdentifier: scoringIdentifier,
              provider: "licensed"
            },
            {
              playerId: "wr-b",
              projectedPoints: 190,
              scoringConfigurationIdentifier: scoringIdentifier,
              provider: "licensed"
            }
          ],
          expertRankings: [
            { playerId: "rb-a", overallRank: 2, provider: "licensed" },
            { playerId: "rb-b", overallRank: 4, provider: "licensed" },
            {
              playerId: "wr-a",
              overallRank: 1,
              positionRank: 1,
              provider: "licensed"
            },
            { playerId: "wr-b", overallRank: 3, provider: "licensed" }
          ],
          adpSnapshot: {
            provider: "permitted-adp",
            scoringFormat: "ppr",
            leagueSize: 2,
            retrievedAt: new Date("2026-07-25T12:00:00Z"),
            records: [
              { playerId: "rb-a", overallAdp: 3, positionalAdp: 1 },
              { playerId: "rb-b", overallAdp: 6, positionalAdp: 2 },
              { playerId: "wr-a", overallAdp: 2, positionalAdp: 1 },
              { playerId: "wr-b", overallAdp: 5, positionalAdp: 2 }
            ]
          },
          hybridWeights: {
            modelProjection: 25,
            expertProjection: 25,
            expertRanking: 25,
            riskAdjustedReplacement: 25,
            allowRenormalization: false
          }
        }
      )
    );

    const rbA = result.players.find((record) => record.playerId === "rb-a")!;
    expect(result.activeFormula).toMatchObject({ configured: true, generated: true });
    expect(rbA).toMatchObject({
      modelRank: expect.any(Number),
      modelPositionRank: 1,
      expertRank: 2,
      expertPositionRank: 1,
      hybridRank: expect.any(Number),
      flexRank: expect.any(Number),
      overallTier: expect.any(Number),
      positionTier: expect.any(Number),
      replacementValue: expect.any(Number),
      valueOverReplacement: expect.any(Number),
      positionalScarcity: expect.any(Number),
      adpValue: expect.any(Number),
      floor: 220,
      ceiling: 280,
      risk: expect.any(Number),
      confidence: 0.75,
      inputAvailability: {
        modelProjection: true,
        expertProjection: true,
        expertRanking: true,
        adp: true
      }
    });
    expect(rbA.explanation.join(" ")).toContain("Hybrid rank");
    expect(result.scoringConfiguration).toEqual({
      identifier: scoringIdentifier,
      name: "Full PPR"
    });
  });

  it("returns model rankings and explains why expert and hybrid ranks are absent", () => {
    const result = createRankingEngine().rank(
      baseInput([
        player("rb-a", "RB", 250),
        player("rb-b", "RB", 210),
        player("wr-a", "WR", 240),
        player("wr-b", "WR", 200)
      ])
    );

    expect(result.activeFormula).toMatchObject({
      configured: false,
      generated: false,
      reason: "No hybrid weights were supplied."
    });
    expect(result.players.every((record) => record.expertRank === null)).toBe(true);
    expect(result.players.every((record) => record.hybridRank === null)).toBe(true);
    expect(result.players[0]).toMatchObject({
      modelRank: 1,
      inputAvailability: {
        modelProjection: true,
        expertProjection: false,
        expertRanking: false,
        adp: false
      }
    });
  });

  it("returns null ADP value when no snapshot is available", () => {
    const result = createRankingEngine().rank(
      baseInput([player("rb-a", "RB", 250), player("rb-b", "RB", 200)])
    );

    expect(result.players.map((record) => record.adpValue)).toEqual([null, null]);
    expect(result.activeFormula.availablePlayersBySignal).toMatchObject({
      modelProjection: 2,
      expertProjection: 0,
      expertRanking: 0
    });
  });

  it("breaks equal model scores deterministically by projected points and canonical player ID", () => {
    const input = baseInput([player("z-player", "RB", 200), player("a-player", "RB", 200)], {
      replacementLevelAssumptions: {
        benchAllocationByPosition: {},
        rankOverridesByPosition: {},
        projectedPointOverridesByPosition: { RB: 150 }
      }
    });

    const first = createRankingEngine().rank(input);
    const second = createRankingEngine().rank({
      ...input,
      modelProjections: [...input.modelProjections].reverse()
    });

    expect(first.players.map((record) => record.playerId)).toEqual(["a-player", "z-player"]);
    expect(second.players.map((record) => record.playerId)).toEqual(["a-player", "z-player"]);
  });

  it("moves replacement level with league size", () => {
    const projections = [
      player("rb-1", "RB", 300),
      player("rb-2", "RB", 280),
      player("rb-3", "RB", 260),
      player("rb-4", "RB", 240),
      player("rb-5", "RB", 220),
      player("rb-6", "RB", 200)
    ];
    const assumptions = {
      benchAllocationByPosition: { RB: 0.5 },
      rankOverridesByPosition: {},
      projectedPointOverridesByPosition: {}
    };
    const small = createRankingEngine().rank(
      baseInput(projections, {
        leagueSize: 2,
        replacementLevelAssumptions: assumptions
      })
    );
    const large = createRankingEngine().rank(
      baseInput(projections, {
        leagueSize: 4,
        replacementLevelAssumptions: assumptions
      })
    );

    expect(small.replacementLevels.RB).toMatchObject({
      rank: 4,
      projectedPoints: 240
    });
    expect(large.replacementLevels.RB).toMatchObject({
      rank: 8,
      projectedPoints: 200
    });
    expect(large.players[0]!.valueOverReplacement).toBeGreaterThan(
      small.players[0]!.valueOverReplacement
    );
  });

  it("derives FLEX eligibility from unusual superflex roster settings", () => {
    const result = createRankingEngine().rank(
      baseInput(
        [
          player("qb-a", "QB", 320),
          player("qb-b", "QB", 300),
          player("rb-a", "RB", 250),
          player("wr-a", "WR", 240),
          player("k-a", "K", 140)
        ],
        {
          rosterConfiguration: {
            totalRosterSlotsPerTeam: 5,
            benchSlotsPerTeam: 1,
            injuredReserveSlotsPerTeam: 0
          },
          startingLineupConfiguration: {
            slots: [
              { name: "SUPERFLEX", count: 1, eligiblePositions: ["QB", "RB", "WR", "TE"] },
              { name: "WR", count: 1, eligiblePositions: ["WR"] },
              { name: "K", count: 1, eligiblePositions: ["K"] }
            ]
          },
          replacementLevelAssumptions: {
            benchAllocationByPosition: { QB: 1 },
            rankOverridesByPosition: {},
            projectedPointOverridesByPosition: {}
          }
        }
      )
    );

    expect(result.players.find((record) => record.playerId === "qb-a")?.flexRank).not.toBeNull();
    expect(result.players.find((record) => record.playerId === "k-a")?.flexRank).toBeNull();
  });

  it("honors custom-scoring projections and rejects mismatched scoring inputs", () => {
    const customRules: ScoringRules = {
      name: "Reception-heavy",
      statPoints: { receptions: 2 },
      customPointValues: {},
      thresholdBonuses: [],
      longPlayBonuses: [],
      defensePointsAllowedTiers: [],
      defenseYardsAllowedTiers: []
    };
    const input = baseInput(
      [
        player("receiver", "WR", 320, {
          scoringConfigurationIdentifier: "reception-heavy-v1"
        }),
        player("runner", "RB", 250, {
          scoringConfigurationIdentifier: "reception-heavy-v1"
        })
      ],
      {
        scoring: {
          configurationIdentifier: "reception-heavy-v1",
          rules: customRules
        },
        replacementLevelAssumptions: {
          benchAllocationByPosition: {},
          rankOverridesByPosition: {},
          projectedPointOverridesByPosition: { WR: 200, RB: 200 }
        }
      }
    );

    expect(createRankingEngine().rank(input).players[0]?.playerId).toBe("receiver");
    expect(() =>
      createRankingEngine().rank({
        ...input,
        scoring: { ...input.scoring, configurationIdentifier: "other-scoring" }
      })
    ).toThrow("Model projection scoring must match");
  });

  it("creates reproducible tier boundaries from material value gaps", () => {
    const result = createRankingEngine().rank(
      baseInput(
        [
          player("wr-1", "WR", 300),
          player("wr-2", "WR", 295),
          player("wr-3", "WR", 200),
          player("wr-4", "WR", 198)
        ],
        {
          replacementLevelAssumptions: {
            benchAllocationByPosition: {},
            rankOverridesByPosition: {},
            projectedPointOverridesByPosition: { WR: 150 }
          }
        }
      )
    );

    const tiers = Object.fromEntries(
      result.players.map((record) => [record.playerId, record.positionTier])
    );
    expect(tiers).toEqual({ "wr-1": 1, "wr-2": 1, "wr-3": 2, "wr-4": 2 });
  });

  it("uses configurable hybrid weights and requires explicit renormalization", () => {
    const projections = [
      player("rb-a", "RB", 250),
      player("rb-b", "RB", 220),
      player("wr-a", "WR", 240)
    ];
    const expertProjections = [
      {
        playerId: "rb-a",
        projectedPoints: 230,
        scoringConfigurationIdentifier: scoringIdentifier,
        provider: "licensed"
      },
      {
        playerId: "rb-b",
        projectedPoints: 260,
        scoringConfigurationIdentifier: scoringIdentifier,
        provider: "licensed"
      }
    ];
    const hybridWeights = {
      modelProjection: 35,
      expertProjection: 50,
      expertRanking: 0,
      riskAdjustedReplacement: 15,
      allowRenormalization: false
    };
    const strict = createRankingEngine().rank(
      baseInput(projections, { expertProjections, hybridWeights })
    );
    expect(strict.activeFormula).toMatchObject({
      configured: true,
      generated: false,
      allowRenormalization: false
    });
    expect(strict.players.every((record) => record.hybridRank === null)).toBe(true);

    const renormalized = createRankingEngine().rank(
      baseInput(projections, {
        expertProjections,
        hybridWeights: { ...hybridWeights, allowRenormalization: true }
      })
    );
    expect(renormalized.activeFormula).toMatchObject({
      generated: true,
      allowRenormalization: true,
      formula: "35% modelProjection + 50% expertProjection + 15% riskAdjustedReplacement"
    });
    expect(
      renormalized.players.find((record) => record.playerId === "wr-a")?.missingHybridInputs
    ).toEqual(["expertProjection"]);
    expect(
      renormalized.players.find((record) => record.playerId === "wr-a")?.effectiveHybridWeights
        ?.expertProjection
    ).toBe(0);
  });

  it("ignores source records for missing model players with an explicit warning", () => {
    const result = createRankingEngine().rank(
      baseInput([player("known", "RB", 250)], {
        expertRankings: [
          {
            playerId: "missing",
            overallRank: 1,
            provider: "licensed"
          }
        ]
      })
    );

    expect(result.players).toHaveLength(1);
    expect(result.warnings).toContain(
      "Ignored expert ranking records for players missing model projections: missing."
    );
  });

  it("rejects conflicting provider IDs across canonical players and source records", () => {
    const projections = [
      player("one", "RB", 250, {
        externalIds: [{ provider: "licensed", value: "shared" }]
      }),
      player("two", "WR", 240, {
        externalIds: [{ provider: "LICENSED", value: "shared" }]
      })
    ];
    expect(() => createRankingEngine().rank(baseInput(projections))).toThrow(
      "Conflicting provider ID"
    );

    expect(() =>
      createRankingEngine().rank(
        baseInput(
          [
            player("one", "RB", 250, {
              externalIds: [{ provider: "licensed", value: "one-id" }]
            }),
            player("two", "WR", 240)
          ],
          {
            expertRankings: [
              {
                playerId: "two",
                overallRank: 1,
                provider: "licensed",
                providerPlayerId: "one-id"
              }
            ]
          }
        )
      )
    ).toThrow("belongs to one, not two");
  });
});
