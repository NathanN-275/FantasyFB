import { z } from "zod";

const STAT_CATEGORIES = [
  "passingYards",
  "passingTouchdowns",
  "passingInterceptions",
  "passingTwoPointConversions",
  "passingFirstDowns",
  "rushingYards",
  "rushingTouchdowns",
  "rushingTwoPointConversions",
  "rushingFirstDowns",
  "receivingYards",
  "receptions",
  "receivingTouchdowns",
  "receivingTwoPointConversions",
  "receivingFirstDowns",
  "returnYards",
  "returnTouchdowns",
  "returnFirstDowns",
  "fieldGoalsMade",
  "fieldGoalsMissed",
  "extraPointsMade",
  "extraPointsMissed",
  "defenseSacks",
  "defenseInterceptions",
  "defenseFumbleRecoveries",
  "defenseForcedFumbles",
  "defenseSafeties",
  "defenseBlockedKicks",
  "defenseTouchdowns",
  "defenseReturnTouchdowns"
] as const;

export type StatCategory = (typeof STAT_CATEGORIES)[number];
export type LongPlayCategory =
  "passingTouchdown" | "rushingTouchdown" | "receivingTouchdown" | "returnTouchdown";

const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.min(0);

export const scoringRulesSchema = z
  .object({
    name: z.string().min(1),
    statPoints: z.record(z.enum(STAT_CATEGORIES), finiteNumber).default({}),
    customPointValues: z.record(z.string().min(1), finiteNumber).default({}),
    thresholdBonuses: z
      .array(
        z.object({
          name: z.string().min(1),
          stat: z.enum(STAT_CATEGORIES),
          atLeast: nonNegativeNumber,
          points: finiteNumber
        })
      )
      .default([]),
    longPlayBonuses: z
      .array(
        z.object({
          category: z.enum([
            "passingTouchdown",
            "rushingTouchdown",
            "receivingTouchdown",
            "returnTouchdown"
          ]),
          atLeastYards: nonNegativeNumber,
          points: finiteNumber
        })
      )
      .default([]),
    defensePointsAllowedTiers: z
      .array(z.object({ atMost: nonNegativeNumber, points: finiteNumber }))
      .default([]),
    defenseYardsAllowedTiers: z
      .array(z.object({ atMost: nonNegativeNumber, points: finiteNumber }))
      .default([])
  })
  .strict();

export type ScoringRules = z.infer<typeof scoringRulesSchema>;

const statValuesSchema = z
  .object(
    Object.fromEntries(
      STAT_CATEGORIES.map((category) => [category, finiteNumber.optional()])
    ) as Record<StatCategory, z.ZodOptional<typeof finiteNumber>>
  )
  .partial();

export const statLineSchema = z
  .object({
    subject: z.enum(["player", "defense"]),
    stats: statValuesSchema.default({}),
    defensePointsAllowed: nonNegativeNumber.optional(),
    defenseYardsAllowed: nonNegativeNumber.optional(),
    longPlays: z
      .array(
        z.object({
          category: z.enum([
            "passingTouchdown",
            "rushingTouchdown",
            "receivingTouchdown",
            "returnTouchdown"
          ]),
          yards: nonNegativeNumber
        })
      )
      .default([]),
    customStats: z.record(z.string().min(1), finiteNumber).default({})
  })
  .passthrough();

export type StatLine = z.infer<typeof statLineSchema>;

export interface ScoringBreakdownItem {
  category: string;
  points: number;
  detail: string;
}

export interface ScoringResult {
  totalPoints: number;
  categories: readonly ScoringBreakdownItem[];
  thresholdBonuses: readonly ScoringBreakdownItem[];
  penalties: readonly ScoringBreakdownItem[];
  warnings: readonly string[];
  unsupportedFields: readonly string[];
  missingStats: readonly string[];
}

const RECOGNIZED_STAT_LINE_FIELDS = new Set([
  "subject",
  "stats",
  "defensePointsAllowed",
  "defenseYardsAllowed",
  "longPlays",
  "customStats"
]);

function scoreItem(category: string, points: number, detail: string): ScoringBreakdownItem {
  return { category, points, detail };
}

function chooseDefenseTier(
  value: number,
  tiers: readonly { atMost: number; points: number }[]
): { atMost: number; points: number } | undefined {
  return [...tiers].sort((a, b) => a.atMost - b.atMost).find((tier) => value <= tier.atMost);
}

/**
 * A side-effect-free scoring engine. Rules are validated once and stat lines are
 * validated at calculation time to make the public boundary safe for adapters.
 */
export function createScoringEngine(inputRules: unknown) {
  const rules = scoringRulesSchema.parse(inputRules);

  return {
    rules,
    score(inputStatLine: unknown): ScoringResult {
      const statLine = statLineSchema.parse(inputStatLine);
      const categories: ScoringBreakdownItem[] = [];
      const thresholdBonuses: ScoringBreakdownItem[] = [];
      const penalties: ScoringBreakdownItem[] = [];
      const missingStats = new Set<string>();
      const unsupportedFields = Object.keys(inputStatLine as Record<string, unknown>).filter(
        (field) => !RECOGNIZED_STAT_LINE_FIELDS.has(field)
      );

      for (const [category, rate] of Object.entries(rules.statPoints) as [StatCategory, number][]) {
        const value = statLine.stats[category];
        if (value === undefined) {
          missingStats.add(category);
          continue;
        }
        const points = value * rate;
        const item = scoreItem(category, points, `${value} × ${rate}`);
        (points < 0 ? penalties : categories).push(item);
      }

      for (const [name, rate] of Object.entries(rules.customPointValues)) {
        const value = statLine.customStats[name];
        if (value === undefined) {
          missingStats.add(`customStats.${name}`);
          continue;
        }
        const points = value * rate;
        const item = scoreItem(`custom:${name}`, points, `${value} × ${rate}`);
        (points < 0 ? penalties : categories).push(item);
      }

      for (const bonus of rules.thresholdBonuses) {
        const value = statLine.stats[bonus.stat];
        if (value === undefined) {
          missingStats.add(bonus.stat);
        } else if (value >= bonus.atLeast) {
          const item = scoreItem(
            bonus.name,
            bonus.points,
            `${bonus.stat} ${value} ≥ ${bonus.atLeast}`
          );
          (bonus.points < 0 ? penalties : thresholdBonuses).push(item);
        }
      }

      for (const play of statLine.longPlays) {
        for (const bonus of rules.longPlayBonuses) {
          if (play.category === bonus.category && play.yards >= bonus.atLeastYards) {
            const item = scoreItem(
              `${play.category} long-play bonus`,
              bonus.points,
              `${play.yards} yards ≥ ${bonus.atLeastYards}`
            );
            (bonus.points < 0 ? penalties : thresholdBonuses).push(item);
          }
        }
      }

      const defenseTiers: Array<
        [
          "defensePointsAllowed" | "defenseYardsAllowed",
          number | undefined,
          readonly { atMost: number; points: number }[]
        ]
      > = [
        ["defensePointsAllowed", statLine.defensePointsAllowed, rules.defensePointsAllowedTiers],
        ["defenseYardsAllowed", statLine.defenseYardsAllowed, rules.defenseYardsAllowedTiers]
      ];
      for (const [category, value, tiers] of defenseTiers) {
        if (tiers.length === 0) continue;
        if (value === undefined) {
          missingStats.add(category);
          continue;
        }
        const tier = chooseDefenseTier(value, tiers);
        if (tier) {
          const item = scoreItem(category, tier.points, `${value} ≤ ${tier.atMost}`);
          (tier.points < 0 ? penalties : thresholdBonuses).push(item);
        }
      }

      const warnings = [
        ...(unsupportedFields.length > 0
          ? [`Unsupported stat-line fields ignored: ${unsupportedFields.join(", ")}.`]
          : []),
        ...Object.keys(statLine.customStats)
          .filter((name) => rules.customPointValues[name] === undefined)
          .map((name) => `No scoring rule exists for custom stat "${name}".`)
      ];
      const allItems = [...categories, ...thresholdBonuses, ...penalties];
      return {
        totalPoints: allItems.reduce((total, item) => total + item.points, 0),
        categories,
        thresholdBonuses,
        penalties,
        warnings,
        unsupportedFields,
        missingStats: [...missingStats].sort()
      };
    }
  };
}

export const SCORING_PRESETS = {
  fullPpr: scoringRulesSchema.parse({
    name: "Full PPR",
    statPoints: {
      passingYards: 0.04,
      passingTouchdowns: 4,
      passingInterceptions: -2,
      rushingYards: 0.1,
      rushingTouchdowns: 6,
      receivingYards: 0.1,
      receptions: 1,
      receivingTouchdowns: 6,
      fieldGoalsMade: 3,
      extraPointsMade: 1,
      defenseSacks: 1,
      defenseInterceptions: 2,
      defenseFumbleRecoveries: 2,
      defenseSafeties: 2,
      defenseTouchdowns: 6
    }
  }),
  halfPpr: scoringRulesSchema.parse({
    name: "Half PPR",
    statPoints: {
      passingYards: 0.04,
      passingTouchdowns: 4,
      passingInterceptions: -2,
      rushingYards: 0.1,
      rushingTouchdowns: 6,
      receivingYards: 0.1,
      receptions: 0.5,
      receivingTouchdowns: 6,
      fieldGoalsMade: 3,
      extraPointsMade: 1,
      defenseSacks: 1,
      defenseInterceptions: 2,
      defenseFumbleRecoveries: 2,
      defenseSafeties: 2,
      defenseTouchdowns: 6
    }
  }),
  standard: scoringRulesSchema.parse({
    name: "Standard",
    statPoints: {
      passingYards: 0.04,
      passingTouchdowns: 4,
      passingInterceptions: -2,
      rushingYards: 0.1,
      rushingTouchdowns: 6,
      receivingYards: 0.1,
      receivingTouchdowns: 6,
      fieldGoalsMade: 3,
      extraPointsMade: 1,
      defenseSacks: 1,
      defenseInterceptions: 2,
      defenseFumbleRecoveries: 2,
      defenseSafeties: 2,
      defenseTouchdowns: 6
    }
  })
} as const;
