import { scoringRulesSchema } from "@fantasyfb/fantasy-core";
import { z } from "zod";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const HYBRID_SIGNALS = [
  "modelProjection",
  "expertProjection",
  "expertRanking",
  "riskAdjustedReplacement"
] as const;

export type RankingPosition = (typeof POSITIONS)[number];
export type HybridSignal = (typeof HYBRID_SIGNALS)[number];

const finiteNumber = z.number().finite();
const positionSchema = z.enum(POSITIONS);
const externalIdSchema = z
  .object({
    provider: z.string().min(1),
    value: z.string().min(1)
  })
  .strict();

const modelProjectionSchema = z
  .object({
    playerId: z.string().min(1),
    playerName: z.string().min(1),
    position: positionSchema,
    projectedPoints: finiteNumber,
    floor: finiteNumber,
    ceiling: finiteNumber,
    confidence: finiteNumber.min(0).max(1),
    scoringConfigurationIdentifier: z.string().min(1),
    externalIds: z.array(externalIdSchema).default([])
  })
  .strict()
  .refine(
    (projection) =>
      projection.floor <= projection.projectedPoints &&
      projection.projectedPoints <= projection.ceiling,
    {
      message: "Model projection bounds must satisfy floor <= projectedPoints <= ceiling."
    }
  );

const expertProjectionSchema = z
  .object({
    playerId: z.string().min(1),
    projectedPoints: finiteNumber,
    floor: finiteNumber.optional(),
    ceiling: finiteNumber.optional(),
    confidence: finiteNumber.min(0).max(1).optional(),
    scoringConfigurationIdentifier: z.string().min(1),
    provider: z.string().min(1),
    providerPlayerId: z.string().min(1).optional()
  })
  .strict()
  .refine(
    (projection) =>
      (projection.floor === undefined || projection.floor <= projection.projectedPoints) &&
      (projection.ceiling === undefined || projection.projectedPoints <= projection.ceiling),
    {
      message: "Expert projection bounds must contain projectedPoints."
    }
  );

const expertRankingSchema = z
  .object({
    playerId: z.string().min(1),
    overallRank: z.number().int().positive(),
    positionRank: z.number().int().positive().optional(),
    provider: z.string().min(1),
    providerPlayerId: z.string().min(1).optional()
  })
  .strict();

const adpRecordSchema = z
  .object({
    playerId: z.string().min(1),
    overallAdp: finiteNumber.positive(),
    positionalAdp: finiteNumber.positive(),
    providerPlayerId: z.string().min(1).optional()
  })
  .strict();

const lineupSlotSchema = z
  .object({
    name: z.string().min(1),
    count: z.number().int().positive(),
    eligiblePositions: z.array(positionSchema).min(1)
  })
  .strict()
  .refine((slot) => new Set(slot.eligiblePositions).size === slot.eligiblePositions.length, {
    message: "A lineup slot cannot repeat an eligible position."
  });

const positionNumberMapSchema = z
  .object({
    QB: finiteNumber.min(0).optional(),
    RB: finiteNumber.min(0).optional(),
    WR: finiteNumber.min(0).optional(),
    TE: finiteNumber.min(0).optional(),
    K: finiteNumber.min(0).optional(),
    DEF: finiteNumber.min(0).optional()
  })
  .strict()
  .default({});

const positionFiniteMapSchema = z
  .object({
    QB: finiteNumber.optional(),
    RB: finiteNumber.optional(),
    WR: finiteNumber.optional(),
    TE: finiteNumber.optional(),
    K: finiteNumber.optional(),
    DEF: finiteNumber.optional()
  })
  .strict()
  .default({});

const positionRankMapSchema = z
  .object({
    QB: z.number().int().positive().optional(),
    RB: z.number().int().positive().optional(),
    WR: z.number().int().positive().optional(),
    TE: z.number().int().positive().optional(),
    K: z.number().int().positive().optional(),
    DEF: z.number().int().positive().optional()
  })
  .strict()
  .default({});

const hybridWeightsSchema = z
  .object({
    modelProjection: finiteNumber.min(0).default(0),
    expertProjection: finiteNumber.min(0).default(0),
    expertRanking: finiteNumber.min(0).default(0),
    riskAdjustedReplacement: finiteNumber.min(0).default(0),
    allowRenormalization: z.boolean().default(false)
  })
  .strict()
  .refine((weights) => HYBRID_SIGNALS.some((signal) => weights[signal] > 0), {
    message: "At least one hybrid weight must be greater than zero."
  });

export const rankingEngineInputSchema = z
  .object({
    modelProjections: z.array(modelProjectionSchema).min(1),
    expertProjections: z.array(expertProjectionSchema).default([]),
    expertRankings: z.array(expertRankingSchema).default([]),
    adpSnapshot: z
      .object({
        provider: z.string().min(1),
        scoringFormat: z.string().min(1),
        leagueSize: z.number().int().positive(),
        retrievedAt: z.coerce.date(),
        records: z.array(adpRecordSchema)
      })
      .strict()
      .optional(),
    scoring: z
      .object({
        configurationIdentifier: z.string().min(1),
        rules: scoringRulesSchema
      })
      .strict(),
    leagueSize: z.number().int().min(2).max(32),
    rosterConfiguration: z
      .object({
        totalRosterSlotsPerTeam: z.number().int().positive(),
        benchSlotsPerTeam: z.number().int().min(0),
        injuredReserveSlotsPerTeam: z.number().int().min(0).default(0)
      })
      .strict(),
    startingLineupConfiguration: z
      .object({
        slots: z.array(lineupSlotSchema).min(1)
      })
      .strict(),
    replacementLevelAssumptions: z
      .object({
        benchAllocationByPosition: positionNumberMapSchema,
        rankOverridesByPosition: positionRankMapSchema,
        projectedPointOverridesByPosition: positionFiniteMapSchema
      })
      .strict(),
    hybridWeights: hybridWeightsSchema.optional()
  })
  .strict()
  .superRefine((input, context) => {
    reportDuplicateKeys(
      input.modelProjections.map((projection) => projection.playerId),
      ["modelProjections"],
      "model player ID",
      context
    );
    reportDuplicateKeys(
      input.expertProjections.map((projection) => projection.playerId),
      ["expertProjections"],
      "expert projection player ID",
      context
    );
    reportDuplicateKeys(
      input.expertRankings.map((ranking) => ranking.playerId),
      ["expertRankings"],
      "expert ranking player ID",
      context
    );
    reportDuplicateKeys(
      input.adpSnapshot?.records.map((record) => record.playerId) ?? [],
      ["adpSnapshot", "records"],
      "ADP player ID",
      context
    );

    const startingSlots = input.startingLineupConfiguration.slots.reduce(
      (total, slot) => total + slot.count,
      0
    );
    if (
      startingSlots + input.rosterConfiguration.benchSlotsPerTeam >
      input.rosterConfiguration.totalRosterSlotsPerTeam
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rosterConfiguration", "totalRosterSlotsPerTeam"],
        message: "Starting and bench slots cannot exceed total roster slots."
      });
    }

    const benchAllocation = sumPositionMap(
      input.replacementLevelAssumptions.benchAllocationByPosition
    );
    if (benchAllocation > input.rosterConfiguration.benchSlotsPerTeam) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replacementLevelAssumptions", "benchAllocationByPosition"],
        message: "Replacement-level bench allocation cannot exceed configured bench slots."
      });
    }

    for (const position of POSITIONS) {
      if (
        input.replacementLevelAssumptions.rankOverridesByPosition[position] !== undefined &&
        input.replacementLevelAssumptions.projectedPointOverridesByPosition[position] !== undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["replacementLevelAssumptions", position],
          message: `Use either a rank or projected-point replacement override for ${position}, not both.`
        });
      }
    }

    for (const [index, projection] of input.modelProjections.entries()) {
      if (projection.scoringConfigurationIdentifier !== input.scoring.configurationIdentifier) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["modelProjections", index, "scoringConfigurationIdentifier"],
          message: "Model projection scoring must match the active scoring configuration."
        });
      }
    }
    for (const [index, projection] of input.expertProjections.entries()) {
      if (projection.scoringConfigurationIdentifier !== input.scoring.configurationIdentifier) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expertProjections", index, "scoringConfigurationIdentifier"],
          message: "Expert projection scoring must match the active scoring configuration."
        });
      }
    }

    if (input.adpSnapshot && input.adpSnapshot.leagueSize !== input.leagueSize) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["adpSnapshot", "leagueSize"],
        message: "ADP snapshot league size must match the ranking league size."
      });
    }
  });

export type RankingEngineInput = z.infer<typeof rankingEngineInputSchema>;

export interface ReplacementLevel {
  readonly position: RankingPosition;
  readonly rank: number | null;
  readonly projectedPoints: number;
  readonly source: "derived-roster-demand" | "rank-override" | "point-override" | "not-rostered";
}

export interface HybridFormulaState {
  readonly configured: boolean;
  readonly generated: boolean;
  readonly allowRenormalization: boolean;
  readonly formula: string;
  readonly configuredWeights: Readonly<Record<HybridSignal, number>>;
  readonly availablePlayersBySignal: Readonly<Record<HybridSignal, number>>;
  readonly totalPlayers: number;
  readonly reason?: string;
}

export interface RankedPlayer {
  readonly playerId: string;
  readonly playerName: string;
  readonly position: RankingPosition;
  readonly modelRank: number;
  readonly modelPositionRank: number;
  readonly expertRank: number | null;
  readonly expertPositionRank: number | null;
  readonly hybridRank: number | null;
  readonly flexRank: number | null;
  readonly overallTier: number;
  readonly positionTier: number;
  readonly modelScore: number;
  readonly hybridScore: number | null;
  readonly replacementValue: number;
  readonly valueOverReplacement: number;
  readonly positionalScarcity: number;
  readonly adpValue: number | null;
  readonly floor: number;
  readonly ceiling: number;
  readonly risk: number;
  readonly confidence: number;
  readonly inputAvailability: {
    readonly modelProjection: true;
    readonly expertProjection: boolean;
    readonly expertRanking: boolean;
    readonly adp: boolean;
  };
  readonly effectiveHybridWeights: Readonly<Record<HybridSignal, number>> | null;
  readonly missingHybridInputs: readonly HybridSignal[];
  readonly explanation: readonly string[];
}

export interface RankingResult {
  readonly players: readonly RankedPlayer[];
  readonly replacementLevels: Readonly<Record<RankingPosition, ReplacementLevel>>;
  readonly activeFormula: HybridFormulaState;
  readonly scoringConfiguration: {
    readonly identifier: string;
    readonly name: string;
  };
  readonly warnings: readonly string[];
}

interface WorkingPlayer {
  readonly projection: RankingEngineInput["modelProjections"][number];
  readonly projectedPoints: number;
  readonly floor: number;
  readonly ceiling: number;
  readonly confidence: number;
  readonly replacementValue: number;
  readonly valueOverReplacement: number;
  readonly positionalScarcity: number;
  readonly risk: number;
  readonly riskAdjustedReplacement: number;
  readonly modelPositionRank: number;
  modelRank: number;
  flexRank: number | null;
  hybridScore: number | null;
  hybridRank: number | null;
  overallTier: number;
  positionTier: number;
  effectiveHybridWeights: Readonly<Record<HybridSignal, number>> | null;
  missingHybridInputs: readonly HybridSignal[];
}

/**
 * Pure ranking and tier module. Callers supply normalized, canonical inputs and
 * receive every league-aware ranking artifact in one deterministic result.
 */
export class RankingEngine {
  rank(rawInput: unknown): RankingResult {
    const input = rankingEngineInputSchema.parse(rawInput);
    validateProviderIdentities(input);

    const modelPlayerIds = new Set(input.modelProjections.map((projection) => projection.playerId));
    const warnings = unknownPlayerWarnings(input, modelPlayerIds);
    const knownExpertProjections = input.expertProjections.filter((projection) =>
      modelPlayerIds.has(projection.playerId)
    );
    const knownExpertRankings = input.expertRankings.filter((ranking) =>
      modelPlayerIds.has(ranking.playerId)
    );
    const knownAdpRecords =
      input.adpSnapshot?.records.filter((record) => modelPlayerIds.has(record.playerId)) ?? [];

    const expertProjections = new Map(
      knownExpertProjections.map((projection) => [projection.playerId, projection])
    );
    const expertRankings = new Map(
      knownExpertRankings.map((ranking) => [ranking.playerId, ranking])
    );
    const adpRecords = new Map(knownAdpRecords.map((record) => [record.playerId, record]));

    const projectionsByPosition = groupProjectionsByPosition(input.modelProjections);
    const replacementLevels = calculateReplacementLevels(input, projectionsByPosition, warnings);
    const positionRanks = calculatePositionRanks(projectionsByPosition);
    const scarcityByPosition = calculateScarcity(projectionsByPosition, replacementLevels);

    const workingPlayers: WorkingPlayer[] = input.modelProjections.map((projection) => {
      const replacementValue = replacementLevels[projection.position].projectedPoints;
      const valueOverReplacement = projection.projectedPoints - replacementValue;
      const risk = calculateRisk(projection);
      return {
        projection,
        projectedPoints: projection.projectedPoints,
        floor: projection.floor,
        ceiling: projection.ceiling,
        confidence: projection.confidence,
        replacementValue,
        valueOverReplacement,
        positionalScarcity: scarcityByPosition[projection.position],
        risk,
        riskAdjustedReplacement: valueOverReplacement * (1 - risk),
        modelPositionRank: positionRanks.get(projection.playerId)!,
        modelRank: 0,
        flexRank: null,
        hybridScore: null,
        hybridRank: null,
        overallTier: 1,
        positionTier: 1,
        effectiveHybridWeights: null,
        missingHybridInputs: []
      };
    });

    assignRanks(
      workingPlayers,
      (player) => player.valueOverReplacement,
      (player, rank) => {
        player.modelRank = rank;
      }
    );
    assignFlexRanks(workingPlayers, input.startingLineupConfiguration.slots);

    const activeFormula = applyHybridRanking(
      workingPlayers,
      input.hybridWeights,
      expertProjections,
      expertRankings
    );
    assignTiers(workingPlayers);

    const expertPositionRanks = deriveExpertPositionRanks(workingPlayers, expertRankings);

    const players = [...workingPlayers]
      .sort((left, right) => left.modelRank - right.modelRank)
      .map<RankedPlayer>((player) => {
        const expertProjection = expertProjections.get(player.projection.playerId);
        const expertRanking = expertRankings.get(player.projection.playerId);
        const adp = adpRecords.get(player.projection.playerId);
        return {
          playerId: player.projection.playerId,
          playerName: player.projection.playerName,
          position: player.projection.position,
          modelRank: player.modelRank,
          modelPositionRank: player.modelPositionRank,
          expertRank: expertRanking?.overallRank ?? null,
          expertPositionRank:
            expertRanking?.positionRank ??
            expertPositionRanks.get(player.projection.playerId) ??
            null,
          hybridRank: player.hybridRank,
          flexRank: player.flexRank,
          overallTier: player.overallTier,
          positionTier: player.positionTier,
          modelScore: player.valueOverReplacement,
          hybridScore: player.hybridScore,
          replacementValue: player.replacementValue,
          valueOverReplacement: player.valueOverReplacement,
          positionalScarcity: player.positionalScarcity,
          adpValue: adp ? adp.overallAdp - player.modelRank : null,
          floor: player.floor,
          ceiling: player.ceiling,
          risk: player.risk,
          confidence: blendedConfidence(player.confidence, expertProjection?.confidence),
          inputAvailability: {
            modelProjection: true,
            expertProjection: Boolean(expertProjection),
            expertRanking: Boolean(expertRanking),
            adp: Boolean(adp)
          },
          effectiveHybridWeights: player.effectiveHybridWeights,
          missingHybridInputs: player.missingHybridInputs,
          explanation: explainPlayer(
            player,
            replacementLevels[player.projection.position],
            expertRanking,
            adp,
            activeFormula
          )
        };
      });

    return {
      players,
      replacementLevels,
      activeFormula,
      scoringConfiguration: {
        identifier: input.scoring.configurationIdentifier,
        name: input.scoring.rules.name
      },
      warnings
    };
  }
}

export function createRankingEngine(): RankingEngine {
  return new RankingEngine();
}

function reportDuplicateKeys(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate ${label}: ${value}.`
      });
    }
    seen.add(value);
  }
}

function sumPositionMap(values: Partial<Record<RankingPosition, number | undefined>>): number {
  return POSITIONS.reduce((total, position) => total + (values[position] ?? 0), 0);
}

function validateProviderIdentities(input: RankingEngineInput): void {
  const canonicalByExternalId = new Map<string, string>();
  for (const projection of input.modelProjections) {
    for (const externalId of projection.externalIds) {
      const key = externalIdentityKey(externalId.provider, externalId.value);
      const existingPlayerId = canonicalByExternalId.get(key);
      if (existingPlayerId && existingPlayerId !== projection.playerId) {
        throw new Error(
          `Conflicting provider ID ${externalId.provider}:${externalId.value} maps to both ${existingPlayerId} and ${projection.playerId}.`
        );
      }
      canonicalByExternalId.set(key, projection.playerId);
    }
  }

  const sourcedRecords = [...input.expertProjections, ...input.expertRankings];
  for (const record of sourcedRecords) {
    if (!record.providerPlayerId) continue;
    const mappedPlayerId = canonicalByExternalId.get(
      externalIdentityKey(record.provider, record.providerPlayerId)
    );
    if (mappedPlayerId && mappedPlayerId !== record.playerId) {
      throw new Error(
        `Conflicting provider ID ${record.provider}:${record.providerPlayerId} belongs to ${mappedPlayerId}, not ${record.playerId}.`
      );
    }
  }
  if (input.adpSnapshot) {
    for (const record of input.adpSnapshot.records) {
      if (!record.providerPlayerId) continue;
      const mappedPlayerId = canonicalByExternalId.get(
        externalIdentityKey(input.adpSnapshot.provider, record.providerPlayerId)
      );
      if (mappedPlayerId && mappedPlayerId !== record.playerId) {
        throw new Error(
          `Conflicting provider ID ${input.adpSnapshot.provider}:${record.providerPlayerId} belongs to ${mappedPlayerId}, not ${record.playerId}.`
        );
      }
    }
  }
}

function externalIdentityKey(provider: string, value: string): string {
  return `${provider.trim().toLowerCase()}:${value}`;
}

function unknownPlayerWarnings(
  input: RankingEngineInput,
  modelPlayerIds: ReadonlySet<string>
): string[] {
  const warnings: string[] = [];
  const families = [
    ["expert projection", input.expertProjections],
    ["expert ranking", input.expertRankings],
    ["ADP", input.adpSnapshot?.records ?? []]
  ] as const;
  for (const [label, records] of families) {
    const unknownIds = [
      ...new Set(
        records.map((record) => record.playerId).filter((playerId) => !modelPlayerIds.has(playerId))
      )
    ].sort();
    if (unknownIds.length) {
      warnings.push(
        `Ignored ${label} records for players missing model projections: ${unknownIds.join(", ")}.`
      );
    }
  }
  return warnings;
}

function groupProjectionsByPosition(
  projections: RankingEngineInput["modelProjections"]
): Record<RankingPosition, RankingEngineInput["modelProjections"][number][]> {
  const groups: Record<RankingPosition, RankingEngineInput["modelProjections"][number][]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    K: [],
    DEF: []
  };
  for (const projection of projections) groups[projection.position].push(projection);
  for (const position of POSITIONS) {
    groups[position].sort(compareProjection);
  }
  return groups;
}

function compareProjection(
  left: RankingEngineInput["modelProjections"][number],
  right: RankingEngineInput["modelProjections"][number]
): number {
  return (
    right.projectedPoints - left.projectedPoints || left.playerId.localeCompare(right.playerId)
  );
}

function starterDemandByPosition(
  slots: RankingEngineInput["startingLineupConfiguration"]["slots"]
): Record<RankingPosition, number> {
  const demand = Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<
    RankingPosition,
    number
  >;
  for (const slot of slots) {
    const share = slot.count / slot.eligiblePositions.length;
    for (const position of slot.eligiblePositions) demand[position] += share;
  }
  return demand;
}

function calculateReplacementLevels(
  input: RankingEngineInput,
  projectionsByPosition: Readonly<
    Record<RankingPosition, RankingEngineInput["modelProjections"][number][]>
  >,
  warnings: string[]
): Record<RankingPosition, ReplacementLevel> {
  const starterDemand = starterDemandByPosition(input.startingLineupConfiguration.slots);
  return Object.fromEntries(
    POSITIONS.map((position): [RankingPosition, ReplacementLevel] => {
      const pointOverride =
        input.replacementLevelAssumptions.projectedPointOverridesByPosition[position];
      if (pointOverride !== undefined) {
        return [
          position,
          {
            position,
            rank: null,
            projectedPoints: pointOverride,
            source: "point-override"
          }
        ];
      }

      const rankOverride = input.replacementLevelAssumptions.rankOverridesByPosition[position];
      const derivedDemand =
        starterDemand[position] +
        (input.replacementLevelAssumptions.benchAllocationByPosition[position] ?? 0);
      const replacementRank = rankOverride ?? Math.ceil(input.leagueSize * derivedDemand);
      const source = rankOverride ? "rank-override" : "derived-roster-demand";
      const positionProjections = projectionsByPosition[position];

      if (replacementRank === 0) {
        return [
          position,
          {
            position,
            rank: 0,
            projectedPoints: positionProjections[0]?.projectedPoints ?? 0,
            source: "not-rostered"
          }
        ];
      }
      if (!positionProjections.length) {
        warnings.push(
          `No ${position} model projections were available for replacement rank ${replacementRank}; replacement value is 0.`
        );
        return [position, { position, rank: replacementRank, projectedPoints: 0, source }];
      }
      if (replacementRank > positionProjections.length) {
        warnings.push(
          `${position} replacement rank ${replacementRank} exceeds the ${positionProjections.length} available projections; the last available projection is used.`
        );
      }
      const replacementProjection =
        positionProjections[Math.min(replacementRank, positionProjections.length) - 1]!;
      return [
        position,
        {
          position,
          rank: replacementRank,
          projectedPoints: replacementProjection.projectedPoints,
          source
        }
      ];
    })
  ) as Record<RankingPosition, ReplacementLevel>;
}

function calculatePositionRanks(
  projectionsByPosition: Readonly<
    Record<RankingPosition, RankingEngineInput["modelProjections"][number][]>
  >
): ReadonlyMap<string, number> {
  const ranks = new Map<string, number>();
  for (const position of POSITIONS) {
    projectionsByPosition[position].forEach((projection, index) => {
      ranks.set(projection.playerId, index + 1);
    });
  }
  return ranks;
}

function calculateScarcity(
  projectionsByPosition: Readonly<
    Record<RankingPosition, RankingEngineInput["modelProjections"][number][]>
  >,
  replacementLevels: Readonly<Record<RankingPosition, ReplacementLevel>>
): Record<RankingPosition, number> {
  return Object.fromEntries(
    POSITIONS.map((position) => {
      const topProjection = projectionsByPosition[position][0]?.projectedPoints ?? 0;
      const range = topProjection - replacementLevels[position].projectedPoints;
      return [position, clamp(range / Math.max(Math.abs(topProjection), 1), 0, 1)];
    })
  ) as Record<RankingPosition, number>;
}

function calculateRisk(projection: RankingEngineInput["modelProjections"][number]): number {
  const uncertaintyWidth =
    (projection.ceiling - projection.floor) / Math.max(Math.abs(projection.projectedPoints), 1);
  return clamp(0.6 * (1 - projection.confidence) + 0.4 * Math.min(uncertaintyWidth, 1), 0, 1);
}

function assignRanks(
  players: WorkingPlayer[],
  score: (player: WorkingPlayer) => number,
  assign: (player: WorkingPlayer, rank: number) => void
): void {
  [...players]
    .sort(
      (left, right) =>
        score(right) - score(left) ||
        right.projectedPoints - left.projectedPoints ||
        left.projection.playerId.localeCompare(right.projection.playerId)
    )
    .forEach((player, index) => assign(player, index + 1));
}

function assignFlexRanks(
  players: WorkingPlayer[],
  slots: RankingEngineInput["startingLineupConfiguration"]["slots"]
): void {
  const flexPositions = new Set(
    slots
      .filter((slot) => slot.eligiblePositions.length > 1)
      .flatMap((slot) => slot.eligiblePositions)
  );
  if (!flexPositions.size) return;
  assignRanks(
    players.filter((player) => flexPositions.has(player.projection.position)),
    (player) => player.valueOverReplacement,
    (player, rank) => {
      player.flexRank = rank;
    }
  );
}

function applyHybridRanking(
  players: WorkingPlayer[],
  configuredWeights: RankingEngineInput["hybridWeights"],
  expertProjections: ReadonlyMap<string, RankingEngineInput["expertProjections"][number]>,
  expertRankings: ReadonlyMap<string, RankingEngineInput["expertRankings"][number]>
): HybridFormulaState {
  const availablePlayersBySignal: Record<HybridSignal, number> = {
    modelProjection: players.length,
    expertProjection: expertProjections.size,
    expertRanking: expertRankings.size,
    riskAdjustedReplacement: players.length
  };
  const zeroWeights: Record<HybridSignal, number> = {
    modelProjection: 0,
    expertProjection: 0,
    expertRanking: 0,
    riskAdjustedReplacement: 0
  };
  if (!configuredWeights) {
    return {
      configured: false,
      generated: false,
      allowRenormalization: false,
      formula: "Hybrid ranking is not configured.",
      configuredWeights: zeroWeights,
      availablePlayersBySignal,
      totalPlayers: players.length,
      reason: "No hybrid weights were supplied."
    };
  }

  const totalWeight = HYBRID_SIGNALS.reduce(
    (total, signal) => total + configuredWeights[signal],
    0
  );
  const normalizedWeights = Object.fromEntries(
    HYBRID_SIGNALS.map((signal) => [signal, configuredWeights[signal] / totalWeight])
  ) as Record<HybridSignal, number>;
  const requiredMissing = HYBRID_SIGNALS.filter(
    (signal) => normalizedWeights[signal] > 0 && availablePlayersBySignal[signal] < players.length
  );
  const formula = HYBRID_SIGNALS.filter((signal) => normalizedWeights[signal] > 0)
    .map((signal) => `${formatPercent(normalizedWeights[signal])} ${signal}`)
    .join(" + ");

  if (requiredMissing.length && !configuredWeights.allowRenormalization) {
    for (const player of players) {
      player.missingHybridInputs = requiredMissing.filter(
        (signal) => signalValue(signal, player, expertProjections, expertRankings) === undefined
      );
    }
    return {
      configured: true,
      generated: false,
      allowRenormalization: false,
      formula,
      configuredWeights: normalizedWeights,
      availablePlayersBySignal,
      totalPlayers: players.length,
      reason: `Required hybrid inputs are missing: ${requiredMissing.join(", ")}.`
    };
  }

  const normalizedSignalValues = normalizedHybridSignals(
    players,
    expertProjections,
    expertRankings
  );
  for (const player of players) {
    const values = normalizedSignalValues.get(player.projection.playerId)!;
    const availableSignals = HYBRID_SIGNALS.filter(
      (signal) => normalizedWeights[signal] > 0 && values[signal] !== null
    );
    const availableWeight = availableSignals.reduce(
      (total, signal) => total + normalizedWeights[signal],
      0
    );
    player.missingHybridInputs = HYBRID_SIGNALS.filter(
      (signal) => normalizedWeights[signal] > 0 && values[signal] === null
    );
    if (availableWeight === 0) continue;
    const effectiveWeights = Object.fromEntries(
      HYBRID_SIGNALS.map((signal) => [
        signal,
        values[signal] === null ? 0 : normalizedWeights[signal] / availableWeight
      ])
    ) as Record<HybridSignal, number>;
    player.effectiveHybridWeights = effectiveWeights;
    player.hybridScore = HYBRID_SIGNALS.reduce(
      (score, signal) => score + (values[signal] ?? 0) * effectiveWeights[signal],
      0
    );
  }
  assignRanks(
    players.filter((player) => player.hybridScore !== null),
    (player) => player.hybridScore!,
    (player, rank) => {
      player.hybridRank = rank;
    }
  );

  return {
    configured: true,
    generated: players.some((player) => player.hybridRank !== null),
    allowRenormalization: configuredWeights.allowRenormalization,
    formula,
    configuredWeights: normalizedWeights,
    availablePlayersBySignal,
    totalPlayers: players.length,
    ...(requiredMissing.length
      ? {
          reason: `Available weights were renormalized per player because these inputs are incomplete: ${requiredMissing.join(", ")}.`
        }
      : {})
  };
}

function signalValue(
  signal: HybridSignal,
  player: WorkingPlayer,
  expertProjections: ReadonlyMap<string, RankingEngineInput["expertProjections"][number]>,
  expertRankings: ReadonlyMap<string, RankingEngineInput["expertRankings"][number]>
): number | undefined {
  switch (signal) {
    case "modelProjection":
      return player.projectedPoints;
    case "expertProjection":
      return expertProjections.get(player.projection.playerId)?.projectedPoints;
    case "expertRanking":
      return expertRankings.get(player.projection.playerId)?.overallRank;
    case "riskAdjustedReplacement":
      return player.riskAdjustedReplacement;
  }
}

function normalizedHybridSignals(
  players: readonly WorkingPlayer[],
  expertProjections: ReadonlyMap<string, RankingEngineInput["expertProjections"][number]>,
  expertRankings: ReadonlyMap<string, RankingEngineInput["expertRankings"][number]>
): ReadonlyMap<string, Record<HybridSignal, number | null>> {
  const rawBySignal = Object.fromEntries(
    HYBRID_SIGNALS.map((signal) => [
      signal,
      players.map((player) => {
        const value = signalValue(signal, player, expertProjections, expertRankings);
        return {
          playerId: player.projection.playerId,
          value: value === undefined ? null : signal === "expertRanking" ? -value : value
        };
      })
    ])
  ) as Record<HybridSignal, { playerId: string; value: number | null }[]>;
  const normalizedBySignal = Object.fromEntries(
    HYBRID_SIGNALS.map((signal) => [signal, normalizeValues(rawBySignal[signal])])
  ) as Record<HybridSignal, ReadonlyMap<string, number | null>>;
  return new Map(
    players.map((player) => [
      player.projection.playerId,
      Object.fromEntries(
        HYBRID_SIGNALS.map((signal) => [
          signal,
          normalizedBySignal[signal].get(player.projection.playerId) ?? null
        ])
      ) as Record<HybridSignal, number | null>
    ])
  );
}

function normalizeValues(
  records: readonly { playerId: string; value: number | null }[]
): ReadonlyMap<string, number | null> {
  const present = records.flatMap((record) => (record.value === null ? [] : [record.value]));
  const minimum = Math.min(...present);
  const maximum = Math.max(...present);
  const range = maximum - minimum;
  return new Map(
    records.map((record) => [
      record.playerId,
      record.value === null ? null : range === 0 ? 0.5 : (record.value - minimum) / range
    ])
  );
}

function assignTiers(players: WorkingPlayer[]): void {
  const ordered = [...players].sort(
    (left, right) =>
      compareNullableRanks(left.hybridRank, right.hybridRank) || left.modelRank - right.modelRank
  );
  assignDataDrivenTiers(ordered, (player, tier) => {
    player.overallTier = tier;
  });

  for (const position of POSITIONS) {
    const positionPlayers = players
      .filter((player) => player.projection.position === position)
      .sort((left, right) => left.modelPositionRank - right.modelPositionRank);
    assignDataDrivenTiers(positionPlayers, (player, tier) => {
      player.positionTier = tier;
    });
  }
}

function assignDataDrivenTiers(
  ordered: readonly WorkingPlayer[],
  assign: (player: WorkingPlayer, tier: number) => void
): void {
  if (!ordered.length) return;
  const projectionRange = numericRange(ordered.map((player) => player.projectedPoints));
  const replacementRange = numericRange(ordered.map((player) => player.valueOverReplacement));
  const scarcityRange = numericRange(ordered.map((player) => player.positionalScarcity));
  const gaps = ordered.slice(0, -1).map((player, index) => {
    const next = ordered[index + 1]!;
    const projectionGap =
      Math.max(0, player.projectedPoints - next.projectedPoints) / projectionRange;
    const replacementGap =
      Math.max(0, player.valueOverReplacement - next.valueOverReplacement) / replacementRange;
    const scarcityGap =
      Math.abs(player.positionalScarcity - next.positionalScarcity) / scarcityRange;
    const confidenceGap = Math.abs(player.confidence - next.confidence);
    return 0.35 * projectionGap + 0.35 * replacementGap + 0.15 * scarcityGap + 0.15 * confidenceGap;
  });
  const threshold = robustGapThreshold(gaps);
  let tier = 1;
  ordered.forEach((player, index) => {
    assign(player, tier);
    if (index < gaps.length && gaps[index]! > threshold) tier += 1;
  });
}

function robustGapThreshold(gaps: readonly number[]): number {
  if (!gaps.length) return Number.POSITIVE_INFINITY;
  const center = median(gaps);
  const medianAbsoluteDeviation = median(gaps.map((gap) => Math.abs(gap - center)));
  return center + medianAbsoluteDeviation;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function numericRange(values: readonly number[]): number {
  return Math.max(Math.max(...values) - Math.min(...values), Number.EPSILON);
}

function compareNullableRanks(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function deriveExpertPositionRanks(
  players: readonly WorkingPlayer[],
  expertRankings: ReadonlyMap<string, RankingEngineInput["expertRankings"][number]>
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const position of POSITIONS) {
    players
      .filter(
        (player) =>
          player.projection.position === position && expertRankings.has(player.projection.playerId)
      )
      .sort((left, right) => {
        const leftRank = expertRankings.get(left.projection.playerId)!.overallRank;
        const rightRank = expertRankings.get(right.projection.playerId)!.overallRank;
        return (
          leftRank - rightRank || left.projection.playerId.localeCompare(right.projection.playerId)
        );
      })
      .forEach((player, index) => result.set(player.projection.playerId, index + 1));
  }
  return result;
}

function blendedConfidence(modelConfidence: number, expertConfidence?: number): number {
  return expertConfidence === undefined
    ? modelConfidence
    : (modelConfidence + expertConfidence) / 2;
}

function explainPlayer(
  player: WorkingPlayer,
  replacement: ReplacementLevel,
  expertRanking: RankingEngineInput["expertRankings"][number] | undefined,
  adp: NonNullable<RankingEngineInput["adpSnapshot"]>["records"][number] | undefined,
  formula: HybridFormulaState
): string[] {
  const explanation = [
    `Model rank ${player.modelRank} uses ${formatNumber(player.valueOverReplacement)} value over replacement from ${formatNumber(player.projectedPoints)} projected points.`,
    `${player.projection.position} replacement value is ${formatNumber(replacement.projectedPoints)} points from ${replacement.source}${replacement.rank === null ? "" : ` at position rank ${replacement.rank}`}.`,
    `Tier ${player.overallTier} is based on reproducible projection, replacement-value, scarcity, and confidence gaps.`
  ];
  if (player.hybridRank !== null) {
    explanation.push(
      `Hybrid rank ${player.hybridRank} uses ${formula.formula}${player.missingHybridInputs.length ? " with available weights renormalized" : ""}.`
    );
  } else if (formula.configured) {
    explanation.push(formula.reason ?? "Hybrid ranking could not be generated.");
  }
  if (expertRanking) {
    explanation.push(`Authorized expert rank ${expertRanking.overallRank} is shown separately.`);
  }
  if (adp && typeof adp === "object" && "overallAdp" in adp) {
    explanation.push(
      `ADP value is ${formatNumber(Number(adp.overallAdp) - player.modelRank)} picks; positive values indicate a later market cost than Model Rank.`
    );
  }
  return explanation;
}

function formatNumber(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
