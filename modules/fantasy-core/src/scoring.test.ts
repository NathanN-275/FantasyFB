import { describe, expect, it } from "vitest";
import { createScoringEngine, SCORING_PRESETS } from "./scoring.js";

describe("ScoringEngine", () => {
  it("scores a quarterback using decimal passing yards and a turnover penalty", () => {
    const result = createScoringEngine(SCORING_PRESETS.fullPpr).score({
      subject: "player",
      stats: { passingYards: 302.5, passingTouchdowns: 2, passingInterceptions: 1 }
    });

    expect(result.totalPoints).toBeCloseTo(18.1);
    expect(result.penalties).toEqual([
      { category: "passingInterceptions", points: -2, detail: "1 × -2" }
    ]);
  });

  it("scores running backs, wide receivers, and tight ends with configurable receptions", () => {
    const engine = createScoringEngine(SCORING_PRESETS.halfPpr);

    expect(
      engine.score({
        subject: "player",
        stats: { rushingYards: 88, rushingTouchdowns: 1, receptions: 2 }
      }).totalPoints
    ).toBe(15.8);
    expect(
      engine.score({
        subject: "player",
        stats: { receivingYards: 101, receivingTouchdowns: 1, receptions: 7 }
      }).totalPoints
    ).toBe(19.6);
    expect(
      engine.score({ subject: "player", stats: { receivingYards: 54, receptions: 4 } }).totalPoints
    ).toBe(7.4);
  });

  it("scores kickers, including negative missed-kick scoring", () => {
    const result = createScoringEngine({
      name: "Kicker test",
      statPoints: {
        fieldGoalsMade: 3,
        fieldGoalsMissed: -1,
        extraPointsMade: 1,
        extraPointsMissed: -0.5
      }
    }).score({
      subject: "player",
      stats: { fieldGoalsMade: 3, fieldGoalsMissed: 1, extraPointsMade: 2, extraPointsMissed: 1 }
    });

    expect(result.totalPoints).toBe(9.5);
    expect(result.penalties).toHaveLength(2);
  });

  it("scores defenses and special teams, including allowed-points tiers", () => {
    const result = createScoringEngine({
      name: "Defense test",
      statPoints: { defenseSacks: 1, defenseInterceptions: 2, defenseTouchdowns: 6 },
      defensePointsAllowedTiers: [
        { atMost: 0, points: 10 },
        { atMost: 13, points: 5 }
      ]
    }).score({
      subject: "defense",
      stats: { defenseSacks: 4, defenseInterceptions: 2, defenseTouchdowns: 1 },
      defensePointsAllowed: 7
    });

    expect(result.totalPoints).toBe(19);
    expect(result.thresholdBonuses).toContainEqual({
      category: "defensePointsAllowed",
      points: 5,
      detail: "7 ≤ 13"
    });
  });

  it("adds all applicable threshold and long-play bonuses", () => {
    const result = createScoringEngine({
      name: "Bonus test",
      statPoints: { rushingYards: 0.1, rushingTouchdowns: 6 },
      thresholdBonuses: [
        { name: "100 rushing yards", stat: "rushingYards", atLeast: 100, points: 3 }
      ],
      longPlayBonuses: [{ category: "rushingTouchdown", atLeastYards: 40, points: 2 }]
    }).score({
      subject: "player",
      stats: { rushingYards: 100, rushingTouchdowns: 1 },
      longPlays: [{ category: "rushingTouchdown", yards: 44 }]
    });

    expect(result.totalPoints).toBe(21);
    expect(result.thresholdBonuses).toHaveLength(2);
  });

  it("supports first-down scoring and custom point values", () => {
    const result = createScoringEngine({
      name: "Custom scoring",
      statPoints: { receivingFirstDowns: 0.5 },
      customPointValues: { fumblesLost: -2 }
    }).score({
      subject: "player",
      stats: { receivingFirstDowns: 5 },
      customStats: { fumblesLost: 1 }
    });

    expect(result.totalPoints).toBe(0.5);
    expect(result.penalties).toContainEqual({
      category: "custom:fumblesLost",
      points: -2,
      detail: "1 × -2"
    });
  });

  it("reports missing configured statistics without treating them as observed zeroes", () => {
    const result = createScoringEngine({
      name: "Missing stats",
      statPoints: { rushingYards: 0.1, receptions: 1 }
    }).score({
      subject: "player",
      stats: { rushingYards: 10 }
    });

    expect(result.totalPoints).toBe(1);
    expect(result.missingStats).toEqual(["receptions"]);
  });

  it("warns about unsupported fields and custom values without scoring rules", () => {
    const result = createScoringEngine({ name: "Unsupported", statPoints: {} }).score({
      subject: "player",
      stats: {},
      customStats: { ignoredProviderValue: 8 },
      unknownProviderField: 3
    });

    expect(result.unsupportedFields).toEqual(["unknownProviderField"]);
    expect(result.warnings).toEqual([
      "Unsupported stat-line fields ignored: unknownProviderField.",
      'No scoring rule exists for custom stat "ignoredProviderValue".'
    ]);
  });

  it("does not automatically select a preset", () => {
    expect(SCORING_PRESETS.fullPpr.statPoints.receptions).toBe(1);
    expect(SCORING_PRESETS.halfPpr.statPoints.receptions).toBe(0.5);
    expect(SCORING_PRESETS.standard.statPoints.receptions).toBeUndefined();
  });
});
