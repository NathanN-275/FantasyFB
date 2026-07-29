import { describe, expect, it } from "vitest";
import { draftGuideInputSchema, generateDraftGuide, type DraftGuideInput } from "./index.js";

function player(
  overrides: Partial<{
    playerId: string;
    slug: string;
    playerName: string;
    position: "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
    team: string;
    byeWeek: number;
    overallRank: number;
    positionRank: number;
    tier: number;
    projectedPoints: number;
    floor: number;
    ceiling: number;
    confidence: number;
    riskScore: number;
    positionalScarcity: number;
    adp: number;
  }> = {}
) {
  return {
    playerId: overrides.playerId ?? "player-alpha",
    slug: overrides.slug ?? "player-alpha",
    playerName: overrides.playerName ?? "Player Alpha",
    position: overrides.position ?? ("RB" as const),
    team: overrides.team ?? "BAL",
    byeWeek: overrides.byeWeek ?? 7,
    model: {
      overallRank: overrides.overallRank ?? 2,
      positionRank: overrides.positionRank ?? 1,
      tier: overrides.tier ?? 1,
      projectedPoints: overrides.projectedPoints ?? 300,
      floor: overrides.floor ?? 240,
      ceiling: overrides.ceiling ?? 360,
      confidence: overrides.confidence ?? 0.85,
      riskScore: overrides.riskScore ?? 24,
      positionalScarcity: overrides.positionalScarcity ?? 0.72,
      projectionSourceId: "model-source",
      rankingSourceId: "ranking-source"
    },
    adp: {
      overall: overrides.adp ?? 6,
      sourceId: "adp-source"
    },
    history: {
      seasons: [
        { season: 2024, fantasyPoints: 210 },
        { season: 2025, fantasyPoints: 252 }
      ],
      sourceId: "history-source"
    },
    rosterContext: {
      experienceYears: 3,
      depthRole: "starter" as const,
      sourceId: "roster-source"
    }
  };
}

function baseInput(): DraftGuideInput {
  const starter = player();
  const handcuff = {
    ...player({
      playerId: "player-bravo",
      slug: "player-bravo",
      playerName: "Player Bravo",
      overallRank: 82,
      positionRank: 31,
      tier: 7,
      projectedPoints: 152,
      floor: 88,
      ceiling: 224,
      confidence: 0.58,
      riskScore: 55,
      positionalScarcity: 0.38,
      adp: 104
    }),
    rosterContext: {
      experienceYears: 2,
      depthRole: "backup" as const,
      handcuffToPlayerId: "player-alpha",
      sourceId: "roster-source"
    },
    editorial: {
      categories: ["sleeper", "late-round"] as ("sleeper" | "late-round")[],
      note: "Documented sample editorial note tied to a validated depth-chart role.",
      sourceId: "editorial-source"
    }
  };
  const breakout = {
    ...player({
      playerId: "player-charlie",
      slug: "player-charlie",
      playerName: "Player Charlie",
      position: "WR",
      team: "SEA",
      overallRank: 34,
      positionRank: 15,
      tier: 4,
      projectedPoints: 225,
      floor: 155,
      ceiling: 282,
      confidence: 0.7,
      riskScore: 48,
      positionalScarcity: 0.52,
      adp: 47
    }),
    editorial: {
      categories: ["breakout"] as ["breakout"],
      note: "The sample editorial input highlights a role change supported by the model range.",
      sourceId: "editorial-source"
    }
  };
  const bustRisk = player({
    playerId: "player-delta",
    slug: "player-delta",
    playerName: "Player Delta",
    position: "QB",
    team: "PHI",
    overallRank: 48,
    positionRank: 8,
    tier: 5,
    projectedPoints: 315,
    floor: 238,
    ceiling: 365,
    confidence: 0.59,
    riskScore: 72,
    positionalScarcity: 0.2,
    adp: 31
  });
  const rookie = {
    ...player({
      playerId: "player-echo",
      slug: "player-echo",
      playerName: "Player Echo",
      position: "TE",
      team: "ARI",
      overallRank: 73,
      positionRank: 9,
      tier: 6,
      projectedPoints: 148,
      floor: 84,
      ceiling: 212,
      confidence: 0.52,
      riskScore: 66,
      positionalScarcity: 0.44,
      adp: 98
    }),
    rosterContext: {
      experienceYears: 0,
      depthRole: "committee" as const,
      sourceId: "roster-source"
    }
  };

  return {
    build: {
      season: 2026,
      generatedAt: new Date("2026-07-29T12:00:00Z"),
      projectionVersion: "projection-2026.7",
      rankingVersion: "ranking-2026.7",
      adpSnapshot: "adp-12-team-ppr-2026-07-28",
      scoring: {
        label: "Full PPR",
        receptionPoints: 1,
        passingTouchdownPoints: 4,
        notes: ["No tight-end premium"]
      },
      league: {
        teamCount: 12,
        rosterSize: 16,
        starters: [
          { position: "QB", count: 1 },
          { position: "RB", count: 2 },
          { position: "WR", count: 2 },
          { position: "TE", count: 1 },
          { position: "FLEX", count: 1 }
        ]
      }
    },
    sources: [
      {
        id: "model-source",
        label: "Projection fixture",
        kind: "model",
        datasetVersion: "projection-dataset-7",
        retrievedAt: new Date("2026-07-28T12:00:00Z"),
        usageNote: "Synthetic test projection.",
        isSample: true
      },
      {
        id: "ranking-source",
        label: "Ranking fixture",
        kind: "ranking",
        datasetVersion: "ranking-dataset-7",
        retrievedAt: new Date("2026-07-28T12:00:00Z"),
        usageNote: "Synthetic test ranking.",
        isSample: true
      },
      {
        id: "adp-source",
        label: "ADP fixture",
        kind: "adp",
        datasetVersion: "adp-dataset-12",
        retrievedAt: new Date("2026-07-28T12:00:00Z"),
        usageNote: "Synthetic test market.",
        isSample: true
      },
      {
        id: "history-source",
        label: "History fixture",
        kind: "historical",
        datasetVersion: "history-dataset-2",
        retrievedAt: new Date("2026-02-01T12:00:00Z"),
        usageNote: "Synthetic test history.",
        isSample: true
      },
      {
        id: "roster-source",
        label: "Roster fixture",
        kind: "roster",
        datasetVersion: "roster-dataset-4",
        retrievedAt: new Date("2026-07-28T12:00:00Z"),
        usageNote: "Synthetic test roster context.",
        isSample: true
      },
      {
        id: "editorial-source",
        label: "Editorial fixture",
        kind: "editorial",
        datasetVersion: "editorial-dataset-3",
        retrievedAt: new Date("2026-07-28T12:00:00Z"),
        usageNote: "Documented synthetic editorial input.",
        isSample: true
      }
    ],
    players: [starter, handcuff, breakout, bustRisk, rookie]
  };
}

describe("generateDraftGuide", () => {
  it("records every required build version and assumption", () => {
    const guide = generateDraftGuide(baseInput());

    expect(guide.metadata.season).toBe(2026);
    expect(guide.metadata.projectionVersion).toBe("projection-2026.7");
    expect(guide.metadata.rankingVersion).toBe("ranking-2026.7");
    expect(guide.metadata.adpSnapshot).toBe("adp-12-team-ppr-2026-07-28");
    expect(guide.metadata.datasetVersions).toContain("adp-dataset-12");
    expect(guide.metadata.scoringAssumptions).toContain("Full PPR");
    expect(guide.metadata.leagueSizeAssumptions).toContain("12 teams");
  });

  it("generates every player-target section from validated signals", () => {
    const guide = generateDraftGuide(baseInput());

    expect(guide.sleepers.items.map((item) => item.player.playerId)).toContain("player-bravo");
    expect(guide.breakoutCandidates.items.map((item) => item.player.playerId)).toContain(
      "player-charlie"
    );
    expect(guide.bustRiskPlayers.items.map((item) => item.player.playerId)).toContain(
      "player-delta"
    );
    expect(guide.rookies.items.map((item) => item.player.playerId)).toContain("player-echo");
    expect(guide.handcuffs.items[0]?.headline).toContain("Player Alpha");
    expect(guide.lateRoundTargets.items.map((item) => item.player.playerId)).toContain(
      "player-bravo"
    );
    expect(guide.modelVersusAdp.items.length).toBeGreaterThan(0);
  });

  it("attaches traceable evidence to every player-specific claim", () => {
    const guide = generateDraftGuide(baseInput());
    const claims = [
      ...guide.roundTargets.flatMap((round) => round.players),
      ...guide.playerTiers.flatMap((tier) => tier.players),
      ...guide.sleepers.items,
      ...guide.breakoutCandidates.items,
      ...guide.bustRiskPlayers.items,
      ...guide.rookies.items,
      ...guide.handcuffs.items,
      ...guide.lateRoundTargets.items,
      ...guide.modelVersusAdp.items
    ];

    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(claim.evidence.length).toBeGreaterThan(0);
      expect(claim.evidence.every((evidence) => evidence.datasetVersion.length > 0)).toBe(true);
    }

    const genericNarratives = [
      ...guide.overallStrategy,
      ...guide.positionStrategy,
      guide.leagueSizeEffects,
      guide.scoringFormatEffects,
      ...guide.byeWeekPlanning,
      ...guide.rosterConstruction,
      ...guide.positionScarcity
    ];
    for (const narrative of genericNarratives) {
      expect(narrative.body).not.toMatch(/Player (Alpha|Bravo|Charlie|Delta|Echo)/);
    }
  });

  it("adapts league-size and scoring guidance to the active assumptions", () => {
    const input = baseInput();
    input.build.league.teamCount = 8;
    input.build.scoring.receptionPoints = 0;
    input.build.scoring.passingTouchdownPoints = 6;

    const guide = generateDraftGuide(input);

    expect(guide.leagueSizeEffects.title).toContain("8-team");
    expect(guide.leagueSizeEffects.body).toContain("shallower");
    expect(guide.scoringFormatEffects.body).toContain("do not score directly");
    expect(guide.scoringFormatEffects.body).toContain("Six-point");
  });

  it("shows explicit unavailable states instead of inventing rookie or handcuff claims", () => {
    const input = baseInput();
    input.players = input.players.map((item) => ({
      ...item,
      rosterContext: {
        experienceYears: 3,
        depthRole: "starter" as const,
        sourceId: "roster-source"
      }
    }));

    const guide = generateDraftGuide(input);

    expect(guide.rookies.items).toHaveLength(0);
    expect(guide.rookies.emptyReason).toContain("No validated rookie");
    expect(guide.handcuffs.items).toHaveLength(0);
    expect(guide.handcuffs.emptyReason).toContain("No validated handcuff");
  });

  it("rejects a player claim whose evidence source has the wrong kind", () => {
    const input = baseInput();
    input.players[0]!.adp!.sourceId = "history-source";

    const result = draftGuideInputSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join(" ")).toContain("expected adp");
    }
  });

  it("rejects a handcuff relationship to a player on another team", () => {
    const input = baseInput();
    input.players[1]!.team = "DET";

    expect(() => generateDraftGuide(input)).toThrow("same NFL team");
  });
});
