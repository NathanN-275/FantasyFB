import { z } from "zod";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const INJURY_STATUSES = [
  "healthy",
  "questionable",
  "doubtful",
  "out",
  "injured-reserve",
  "pup",
  "suspended",
  "unknown"
] as const;

export type TradePosition = (typeof POSITIONS)[number];
export type TradeInjuryStatus = (typeof INJURY_STATUSES)[number];

const finiteNumber = z.number().finite();
const positionSchema = z.enum(POSITIONS);
const injuryStatusSchema = z.enum(INJURY_STATUSES);

const positionValueMapSchema = z
  .object({
    QB: finiteNumber.min(0).optional(),
    RB: finiteNumber.min(0).optional(),
    WR: finiteNumber.min(0).optional(),
    TE: finiteNumber.min(0).optional(),
    K: finiteNumber.min(0).optional(),
    DEF: finiteNumber.min(0).optional()
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

const rosterSettingsSchema = z
  .object({
    starterSlots: z.array(lineupSlotSchema).min(1),
    benchSlots: z.number().int().min(0),
    injuredReserveSlots: z.number().int().min(0).default(0)
  })
  .strict();

const projectionSchema = z
  .object({
    playerId: z.string().min(1),
    fullSeasonPoints: finiteNumber,
    shortTermPoints: finiteNumber.optional(),
    floor: finiteNumber,
    ceiling: finiteNumber,
    confidence: finiteNumber.min(0).max(1),
    remainingGames: z.number().int().min(1).max(18),
    scoringConfigurationIdentifier: z.string().min(1)
  })
  .strict()
  .refine(
    (projection) =>
      projection.floor <= projection.fullSeasonPoints &&
      projection.fullSeasonPoints <= projection.ceiling,
    { message: "Projection bounds must contain fullSeasonPoints." }
  );

const expertProjectionSchema = z
  .object({
    playerId: z.string().min(1),
    fullSeasonPoints: finiteNumber,
    shortTermPoints: finiteNumber.optional(),
    floor: finiteNumber,
    ceiling: finiteNumber,
    confidence: finiteNumber.min(0).max(1),
    remainingGames: z.number().int().min(1).max(18),
    scoringConfigurationIdentifier: z.string().min(1),
    provider: z.string().min(1)
  })
  .strict()
  .refine(
    (projection) =>
      projection.floor <= projection.fullSeasonPoints &&
      projection.fullSeasonPoints <= projection.ceiling,
    { message: "Expert projection bounds must contain fullSeasonPoints." }
  );

const injuryFactorSchema = z
  .object({
    shortTerm: finiteNumber.min(0).max(1),
    fullSeason: finiteNumber.min(0).max(1)
  })
  .strict();

const assumptionsSchema = z
  .object({
    shortTermWeeks: z.number().int().min(1).max(8).optional(),
    modelProjectionWeight: finiteNumber.min(0).optional(),
    expertProjectionWeight: finiteNumber.min(0).optional(),
    replacementLevels: positionValueMapSchema.optional(),
    injuryAvailabilityFactors: z
      .object({
        healthy: injuryFactorSchema.optional(),
        questionable: injuryFactorSchema.optional(),
        doubtful: injuryFactorSchema.optional(),
        out: injuryFactorSchema.optional(),
        "injured-reserve": injuryFactorSchema.optional(),
        pup: injuryFactorSchema.optional(),
        suspended: injuryFactorSchema.optional(),
        unknown: injuryFactorSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict()
  .refine(
    (assumptions) =>
      assumptions.modelProjectionWeight === undefined ||
      assumptions.expertProjectionWeight === undefined ||
      assumptions.modelProjectionWeight + assumptions.expertProjectionWeight > 0,
    { message: "At least one projection weight must be greater than zero." }
  );

export const tradeEngineInputSchema = z
  .object({
    league: z
      .object({
        id: z.string().min(1),
        name: z.string().min(1),
        teamCount: z.number().int().min(2).max(32),
        scoringConfigurationIdentifier: z.string().min(1)
      })
      .strict()
      .optional(),
    rosterSettings: rosterSettingsSchema.optional(),
    assumptions: assumptionsSchema.optional(),
    players: z
      .array(
        z
          .object({
            playerId: z.string().min(1),
            playerName: z.string().min(1),
            position: positionSchema,
            nflTeam: z.string().min(1).nullable().default(null)
          })
          .strict()
      )
      .min(2),
    currentRosters: z
      .array(
        z
          .object({
            rosterId: z.string().min(1),
            rosterName: z.string().min(1),
            playerIds: z.array(z.string().min(1))
          })
          .strict()
      )
      .length(2),
    trade: z
      .object({
        sideA: z
          .object({
            rosterId: z.string().min(1),
            playerIds: z.array(z.string().min(1)).min(1)
          })
          .strict(),
        sideB: z
          .object({
            rosterId: z.string().min(1),
            playerIds: z.array(z.string().min(1)).min(1)
          })
          .strict()
      })
      .strict(),
    modelProjections: z.array(projectionSchema).default([]),
    expertProjections: z.array(expertProjectionSchema).default([]),
    rankings: z
      .array(
        z
          .object({
            playerId: z.string().min(1),
            overallRank: z.number().int().positive(),
            positionRank: z.number().int().positive(),
            positionalScarcity: finiteNumber.min(0).max(1),
            rankingKind: z.enum(["model", "expert", "hybrid"])
          })
          .strict()
      )
      .default([]),
    injuries: z
      .array(
        z
          .object({
            playerId: z.string().min(1),
            status: injuryStatusSchema,
            note: z.string().min(1).nullable().default(null)
          })
          .strict()
      )
      .default([]),
    scheduleContext: z
      .array(
        z
          .object({
            playerId: z.string().min(1),
            shortTermFactor: finiteNumber.min(0.5).max(1.5),
            fullSeasonFactor: finiteNumber.min(0.5).max(1.5).default(1),
            note: z.string().min(1)
          })
          .strict()
      )
      .default([])
  })
  .strict()
  .superRefine((input, context) => {
    const playerIds = new Set(input.players.map((player) => player.playerId));
    reportDuplicates(
      input.players.map((player) => player.playerId),
      ["players"],
      "player ID",
      context
    );
    reportDuplicates(
      input.currentRosters.map((roster) => roster.rosterId),
      ["currentRosters"],
      "roster ID",
      context
    );
    reportDuplicates(
      input.currentRosters.flatMap((roster) => roster.playerIds),
      ["currentRosters"],
      "rostered player ID",
      context
    );
    reportDuplicates(
      input.modelProjections.map((projection) => projection.playerId),
      ["modelProjections"],
      "model projection player ID",
      context
    );
    reportDuplicates(
      input.expertProjections.map((projection) => projection.playerId),
      ["expertProjections"],
      "expert projection player ID",
      context
    );
    reportDuplicates(
      input.rankings.map((ranking) => `${ranking.playerId}:${ranking.rankingKind}`),
      ["rankings"],
      "player and ranking kind",
      context
    );
    reportDuplicates(
      input.injuries.map((injury) => injury.playerId),
      ["injuries"],
      "injury player ID",
      context
    );
    reportDuplicates(
      input.scheduleContext.map((schedule) => schedule.playerId),
      ["scheduleContext"],
      "schedule-context player ID",
      context
    );

    input.currentRosters.forEach((roster, rosterIndex) => {
      roster.playerIds.forEach((playerId, playerIndex) => {
        if (!playerIds.has(playerId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["currentRosters", rosterIndex, "playerIds", playerIndex],
            message: `Unknown player ID "${playerId}".`
          });
        }
      });
    });

    const rostersById = new Map(input.currentRosters.map((roster) => [roster.rosterId, roster]));
    if (input.trade.sideA.rosterId === input.trade.sideB.rosterId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trade"],
        message: "Trade sides must reference different rosters."
      });
    }
    (["sideA", "sideB"] as const).forEach((sideName) => {
      const side = input.trade[sideName];
      const roster = rostersById.get(side.rosterId);
      if (!roster) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trade", sideName, "rosterId"],
          message: `Unknown roster ID "${side.rosterId}".`
        });
        return;
      }
      reportDuplicates(
        side.playerIds,
        ["trade", sideName, "playerIds"],
        "traded player ID",
        context
      );
      side.playerIds.forEach((playerId, playerIndex) => {
        if (!roster.playerIds.includes(playerId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["trade", sideName, "playerIds", playerIndex],
            message: `Player "${playerId}" is not on ${roster.rosterName}.`
          });
        }
      });
    });

    const referencedIds = [
      ...input.modelProjections.map((item) => item.playerId),
      ...input.expertProjections.map((item) => item.playerId),
      ...input.rankings.map((item) => item.playerId),
      ...input.injuries.map((item) => item.playerId),
      ...input.scheduleContext.map((item) => item.playerId)
    ];
    referencedIds.forEach((playerId) => {
      if (!playerIds.has(playerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["players"],
          message: `Player data references unknown player ID "${playerId}".`
        });
      }
    });

    if (input.rosterSettings) {
      const rosterSize =
        input.rosterSettings.starterSlots.reduce((total, slot) => total + slot.count, 0) +
        input.rosterSettings.benchSlots +
        input.rosterSettings.injuredReserveSlots;
      input.currentRosters.forEach((roster, rosterIndex) => {
        if (roster.playerIds.length > rosterSize) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["currentRosters", rosterIndex, "playerIds"],
            message: `${roster.rosterName} exceeds the configured roster size.`
          });
        }
      });
    }
  });

export type TradeEngineInput = z.input<typeof tradeEngineInputSchema>;

export interface TradeAssumptions {
  readonly mode: "selected-league" | "generic";
  readonly leagueId: string | null;
  readonly leagueName: string;
  readonly teamCount: number;
  readonly scoringConfigurationIdentifier: string;
  readonly rosterSettings: {
    readonly starterSlots: readonly {
      readonly name: string;
      readonly count: number;
      readonly eligiblePositions: readonly TradePosition[];
    }[];
    readonly benchSlots: number;
    readonly injuredReserveSlots: number;
  };
  readonly shortTermWeeks: number;
  readonly projectionBlend: {
    readonly model: number;
    readonly expert: number;
  };
  readonly replacementLevels: Readonly<Record<TradePosition, number>>;
  readonly injuryAvailabilityFactors: Readonly<
    Record<TradeInjuryStatus, { readonly shortTerm: number; readonly fullSeason: number }>
  >;
}

export interface TradePackageTotals {
  readonly playerIds: readonly string[];
  readonly rawPlayerValue: number;
  readonly shortTermValue: number;
  readonly floor: number;
  readonly ceiling: number;
  readonly replacementValue: number;
  readonly positionalScarcity: number;
  readonly risk: number;
  readonly confidence: number;
}

export interface TradeLineupAssignment {
  readonly slot: string;
  readonly playerId: string | null;
  readonly playerName: string;
  readonly position: TradePosition | null;
  readonly projectedPoints: number;
  readonly replacement: boolean;
}

export interface TradeRosterPointSummary {
  readonly starters: number;
  readonly bench: number;
  readonly total: number;
  readonly benchValueAboveReplacement: number;
  readonly rosterContextValue: number;
}

export interface TradePositionEffect {
  readonly position: TradePosition;
  readonly beforeRosterCount: number;
  readonly afterRosterCount: number;
  readonly beforeStarterPoints: number;
  readonly afterStarterPoints: number;
  readonly starterDelta: number;
}

export interface TradeRosterImpact {
  readonly rosterId: string;
  readonly rosterName: string;
  readonly sendsPlayerIds: readonly string[];
  readonly receivesPlayerIds: readonly string[];
  readonly beforeStartingLineup: readonly TradeLineupAssignment[];
  readonly afterStartingLineup: readonly TradeLineupAssignment[];
  readonly beforeProjectedRosterPoints: TradeRosterPointSummary;
  readonly afterProjectedRosterPoints: TradeRosterPointSummary;
  readonly projectedRosterPointDelta: number;
  readonly startingLineupValue: number;
  readonly benchValue: number;
  readonly replacementValue: number;
  readonly packageConsolidationValue: number;
  readonly rosterContextValue: number;
  readonly shortTermOutlook: number;
  readonly fullSeasonOutlook: number;
  readonly bestPlausibleOutcome: number;
  readonly worstPlausibleOutcome: number;
  readonly riskBefore: number;
  readonly riskAfter: number;
  readonly riskDelta: number;
  readonly confidence: number;
  readonly addedReplacementPlayers: readonly {
    readonly playerId: string;
    readonly position: TradePosition;
    readonly assumedPoints: number;
  }[];
  readonly droppedPlayerIds: readonly string[];
  readonly beforeBenchPlayerIds: readonly string[];
  readonly afterBenchPlayerIds: readonly string[];
  readonly positionalEffects: readonly TradePositionEffect[];
}

export interface TradeEvaluation {
  readonly mode: "selected-league" | "generic";
  readonly assumptions: TradeAssumptions;
  readonly packages: {
    readonly sideA: TradePackageTotals;
    readonly sideB: TradePackageTotals;
  };
  readonly rosterImpacts: {
    readonly sideA: TradeRosterImpact;
    readonly sideB: TradeRosterImpact;
  };
  readonly riskComparison: {
    readonly sideAPackageRisk: number;
    readonly sideBPackageRisk: number;
    readonly lowerRiskPackage: "sideA" | "sideB" | "equal";
  };
  readonly confidence: number;
  readonly missingDataWarnings: readonly string[];
  readonly explanation: readonly string[];
}

type ParsedInput = z.infer<typeof tradeEngineInputSchema>;
type Projection = z.infer<typeof projectionSchema>;
type ExpertProjection = z.infer<typeof expertProjectionSchema>;
type Player = ParsedInput["players"][number];
type Roster = ParsedInput["currentRosters"][number];
type Metric = "expected" | "shortTerm" | "floor" | "ceiling";

interface EvaluatedPlayer extends Player {
  readonly expected: number;
  readonly shortTerm: number;
  readonly floor: number;
  readonly ceiling: number;
  readonly confidence: number;
  readonly risk: number;
  readonly scarcity: number;
  readonly injuryStatus: TradeInjuryStatus;
  readonly replacement: boolean;
}

interface LineupResult {
  readonly assignments: readonly TradeLineupAssignment[];
  readonly starterIds: ReadonlySet<string>;
  readonly points: number;
}

interface RosterEvaluation {
  readonly expectedLineup: LineupResult;
  readonly shortTermLineup: LineupResult;
  readonly floorLineup: LineupResult;
  readonly ceilingLineup: LineupResult;
  readonly bench: readonly EvaluatedPlayer[];
  readonly points: TradeRosterPointSummary;
  readonly risk: number;
  readonly confidence: number;
}

const DEFAULT_ROSTER_SETTINGS = {
  starterSlots: [
    { name: "QB", count: 1, eligiblePositions: ["QB"] as const },
    { name: "RB", count: 2, eligiblePositions: ["RB"] as const },
    { name: "WR", count: 2, eligiblePositions: ["WR"] as const },
    { name: "TE", count: 1, eligiblePositions: ["TE"] as const },
    { name: "FLEX", count: 1, eligiblePositions: ["RB", "WR", "TE"] as const },
    { name: "K", count: 1, eligiblePositions: ["K"] as const },
    { name: "DEF", count: 1, eligiblePositions: ["DEF"] as const }
  ],
  benchSlots: 6,
  injuredReserveSlots: 1
} satisfies TradeAssumptions["rosterSettings"];

const DEFAULT_REPLACEMENT_LEVELS: Record<TradePosition, number> = {
  QB: 250,
  RB: 145,
  WR: 155,
  TE: 125,
  K: 105,
  DEF: 100
};

const DEFAULT_INJURY_FACTORS: TradeAssumptions["injuryAvailabilityFactors"] = {
  healthy: { shortTerm: 1, fullSeason: 1 },
  questionable: { shortTerm: 0.85, fullSeason: 0.97 },
  doubtful: { shortTerm: 0.4, fullSeason: 0.9 },
  out: { shortTerm: 0, fullSeason: 0.82 },
  "injured-reserve": { shortTerm: 0, fullSeason: 0.6 },
  pup: { shortTerm: 0, fullSeason: 0.68 },
  suspended: { shortTerm: 0, fullSeason: 0.75 },
  unknown: { shortTerm: 0.85, fullSeason: 0.9 }
};

function reportDuplicates(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx
) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate ${label} "${value}".`
      });
    }
    seen.add(value);
  }
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function weightedAverage(
  values: readonly { readonly value: number; readonly weight: number }[],
  fallback = 0
): number {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);
  if (totalWeight === 0) return fallback;
  return values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function resolveAssumptions(input: ParsedInput): TradeAssumptions {
  const supplied = input.assumptions;
  const replacementLevels = Object.fromEntries(
    POSITIONS.map((position) => [
      position,
      supplied?.replacementLevels?.[position] ?? DEFAULT_REPLACEMENT_LEVELS[position]
    ])
  ) as Record<TradePosition, number>;
  const injuryAvailabilityFactors = Object.fromEntries(
    INJURY_STATUSES.map((status) => [
      status,
      {
        ...DEFAULT_INJURY_FACTORS[status],
        ...supplied?.injuryAvailabilityFactors?.[status]
      }
    ])
  ) as unknown as TradeAssumptions["injuryAvailabilityFactors"];
  const modelWeight = supplied?.modelProjectionWeight ?? 0.75;
  const expertWeight = supplied?.expertProjectionWeight ?? 0.25;
  const totalWeight = modelWeight + expertWeight;

  return {
    mode: input.league ? "selected-league" : "generic",
    leagueId: input.league?.id ?? null,
    leagueName: input.league?.name ?? "Generic configurable league",
    teamCount: input.league?.teamCount ?? 12,
    scoringConfigurationIdentifier:
      input.league?.scoringConfigurationIdentifier ?? "generic-full-ppr-2026",
    rosterSettings: input.rosterSettings ?? DEFAULT_ROSTER_SETTINGS,
    shortTermWeeks: supplied?.shortTermWeeks ?? 3,
    projectionBlend: {
      model: round(modelWeight / totalWeight),
      expert: round(expertWeight / totalWeight)
    },
    replacementLevels,
    injuryAvailabilityFactors
  };
}

function preferredRanking(
  rankings: ParsedInput["rankings"],
  playerId: string
): ParsedInput["rankings"][number] | undefined {
  const priority = { hybrid: 3, model: 2, expert: 1 };
  return rankings
    .filter((ranking) => ranking.playerId === playerId)
    .sort((a, b) => priority[b.rankingKind] - priority[a.rankingKind])[0];
}

function projectionValue(projection: Projection | ExpertProjection, metric: Metric, weeks: number) {
  if (metric === "expected") return projection.fullSeasonPoints;
  if (metric === "floor") return projection.floor;
  if (metric === "ceiling") return projection.ceiling;
  return (
    projection.shortTermPoints ??
    projection.fullSeasonPoints * Math.min(1, weeks / projection.remainingGames)
  );
}

function evaluatePlayers(
  input: ParsedInput,
  assumptions: TradeAssumptions,
  warnings: Set<string>
): Map<string, EvaluatedPlayer> {
  const models = new Map(
    input.modelProjections.map((projection) => [projection.playerId, projection])
  );
  const experts = new Map(
    input.expertProjections.map((projection) => [projection.playerId, projection])
  );
  const injuries = new Map(input.injuries.map((injury) => [injury.playerId, injury]));
  const schedules = new Map(input.scheduleContext.map((schedule) => [schedule.playerId, schedule]));
  const tradedIds = new Set([...input.trade.sideA.playerIds, ...input.trade.sideB.playerIds]);
  const evaluated = new Map<string, EvaluatedPlayer>();

  for (const player of input.players) {
    const model = models.get(player.playerId);
    const expert = experts.get(player.playerId);
    const validModel =
      model?.scoringConfigurationIdentifier === assumptions.scoringConfigurationIdentifier
        ? model
        : undefined;
    const validExpert =
      expert?.scoringConfigurationIdentifier === assumptions.scoringConfigurationIdentifier
        ? expert
        : undefined;

    if (!model && tradedIds.has(player.playerId)) {
      warnings.add(
        `No model projection is available for ${player.playerName}; its model contribution is zero.`
      );
    } else if (model && !validModel) {
      warnings.add(
        `${player.playerName}'s model projection uses scoring configuration "${model.scoringConfigurationIdentifier}", not "${assumptions.scoringConfigurationIdentifier}", and is excluded.`
      );
    }
    if (expert && !validExpert) {
      warnings.add(
        `${player.playerName}'s expert projection uses a different scoring configuration and is excluded.`
      );
    }

    const sources = [
      ...(validModel
        ? [{ projection: validModel, weight: assumptions.projectionBlend.model }]
        : []),
      ...(validExpert
        ? [{ projection: validExpert, weight: assumptions.projectionBlend.expert }]
        : [])
    ].filter((source) => source.weight > 0);
    if (sources.length === 0) {
      if (tradedIds.has(player.playerId) && (validModel || validExpert)) {
        warnings.add(
          `No compatible projection with a positive configured weight is available for ${player.playerName}; zero value is used.`
        );
      }
      evaluated.set(player.playerId, {
        ...player,
        expected: 0,
        shortTerm: 0,
        floor: 0,
        ceiling: 0,
        confidence: 0,
        risk: 1,
        scarcity: preferredRanking(input.rankings, player.playerId)?.positionalScarcity ?? 0,
        injuryStatus: injuries.get(player.playerId)?.status ?? "unknown",
        replacement: false
      });
      continue;
    }

    const injuryStatus = injuries.get(player.playerId)?.status ?? "unknown";
    if (!injuries.has(player.playerId) && tradedIds.has(player.playerId)) {
      warnings.add(
        `No injury status is available for ${player.playerName}; the disclosed unknown-status factor is used.`
      );
    }
    const injuryFactor = assumptions.injuryAvailabilityFactors[injuryStatus];
    const schedule = schedules.get(player.playerId);
    const expected = weightedAverage(
      sources.map(({ projection, weight }) => ({
        value: projectionValue(projection, "expected", assumptions.shortTermWeeks),
        weight
      }))
    );
    const shortTerm = weightedAverage(
      sources.map(({ projection, weight }) => ({
        value: projectionValue(projection, "shortTerm", assumptions.shortTermWeeks),
        weight
      }))
    );
    const floor = weightedAverage(
      sources.map(({ projection, weight }) => ({
        value: projectionValue(projection, "floor", assumptions.shortTermWeeks),
        weight
      }))
    );
    const ceiling = weightedAverage(
      sources.map(({ projection, weight }) => ({
        value: projectionValue(projection, "ceiling", assumptions.shortTermWeeks),
        weight
      }))
    );
    const confidence = weightedAverage(
      sources.map(({ projection, weight }) => ({ value: projection.confidence, weight }))
    );
    const fullSeasonFactor = injuryFactor.fullSeason * (schedule?.fullSeasonFactor ?? 1);
    const shortTermFactor = injuryFactor.shortTerm * (schedule?.shortTermFactor ?? 1);
    const adjustedExpected = expected * fullSeasonFactor;
    const adjustedFloor = Math.min(adjustedExpected, floor * fullSeasonFactor);
    const adjustedCeiling = Math.max(adjustedExpected, ceiling * fullSeasonFactor);
    const rangeRisk =
      adjustedExpected === 0
        ? 1
        : clamp((adjustedCeiling - adjustedFloor) / (2 * Math.abs(adjustedExpected)));
    const availabilityRisk = 1 - (injuryFactor.shortTerm + injuryFactor.fullSeason) / 2;
    const risk = clamp((1 - confidence) * 0.5 + rangeRisk * 0.3 + availabilityRisk * 0.2);

    evaluated.set(player.playerId, {
      ...player,
      expected: round(adjustedExpected),
      shortTerm: round(shortTerm * shortTermFactor),
      floor: round(adjustedFloor),
      ceiling: round(adjustedCeiling),
      confidence: round(confidence),
      risk: round(risk),
      scarcity: preferredRanking(input.rankings, player.playerId)?.positionalScarcity ?? 0,
      injuryStatus,
      replacement: false
    });
  }

  return evaluated;
}

function metricValue(player: EvaluatedPlayer, metric: Metric): number {
  return player[metric];
}

function expandedSlots(settings: TradeAssumptions["rosterSettings"]) {
  return settings.starterSlots.flatMap((slot) =>
    Array.from({ length: slot.count }, (_, index) => ({
      label: slot.count === 1 ? slot.name : `${slot.name} ${index + 1}`,
      eligiblePositions: slot.eligiblePositions
    }))
  );
}

/**
 * Rectangular Hungarian assignment keeps FLEX and other multi-position slots globally optimal
 * without leaking the matching algorithm through the TradeEngine interface.
 */
function optimizeLineup(
  players: readonly EvaluatedPlayer[],
  settings: TradeAssumptions["rosterSettings"],
  metric: Metric
): LineupResult {
  const slots = expandedSlots(settings);
  if (slots.length === 0) return { assignments: [], starterIds: new Set(), points: 0 };
  const columns = [
    ...players.map((player) => ({ kind: "player" as const, player })),
    ...slots.map(() => ({ kind: "empty" as const }))
  ];
  const costs = slots.map((slot) =>
    columns.map((column) => {
      if (column.kind === "empty") return 0;
      if (!slot.eligiblePositions.includes(column.player.position)) return 1_000_000;
      return -metricValue(column.player, metric);
    })
  );
  const assignment = hungarian(costs);
  const starterIds = new Set<string>();
  const assignments = slots.map((slot, rowIndex): TradeLineupAssignment => {
    const column = columns[assignment[rowIndex] ?? columns.length - 1];
    if (
      !column ||
      column.kind === "empty" ||
      !slot.eligiblePositions.includes(column.player.position) ||
      metricValue(column.player, metric) < 0
    ) {
      return {
        slot: slot.label,
        playerId: null,
        playerName: "Open lineup slot",
        position: null,
        projectedPoints: 0,
        replacement: false
      };
    }
    starterIds.add(column.player.playerId);
    return {
      slot: slot.label,
      playerId: column.player.playerId,
      playerName: column.player.playerName,
      position: column.player.position,
      projectedPoints: round(metricValue(column.player, metric)),
      replacement: column.player.replacement
    };
  });
  return {
    assignments,
    starterIds,
    points: round(assignments.reduce((total, item) => total + item.projectedPoints, 0))
  };
}

function hungarian(costs: readonly (readonly number[])[]): number[] {
  const rowCount = costs.length;
  const columnCount = costs[0]?.length ?? 0;
  const u = Array(rowCount + 1).fill(0) as number[];
  const v = Array(columnCount + 1).fill(0) as number[];
  const matchedRow = Array(columnCount + 1).fill(0) as number[];
  const previousColumn = Array(columnCount + 1).fill(0) as number[];

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRow[0] = row;
    let column = 0;
    const minimum = Array(columnCount + 1).fill(Number.POSITIVE_INFINITY) as number[];
    const used = Array(columnCount + 1).fill(false) as boolean[];
    do {
      used[column] = true;
      const currentRow = matchedRow[column] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= columnCount; candidate += 1) {
        if (used[candidate]) continue;
        const cost = costs[currentRow - 1]?.[candidate - 1] ?? 1_000_000;
        const current = cost - (u[currentRow] ?? 0) - (v[candidate] ?? 0);
        if (current < (minimum[candidate] ?? Number.POSITIVE_INFINITY)) {
          minimum[candidate] = current;
          previousColumn[candidate] = column;
        }
        if ((minimum[candidate] ?? Number.POSITIVE_INFINITY) < delta) {
          delta = minimum[candidate] ?? Number.POSITIVE_INFINITY;
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= columnCount; candidate += 1) {
        if (used[candidate]) {
          const usedRow = matchedRow[candidate] ?? 0;
          u[usedRow] = (u[usedRow] ?? 0) + delta;
          v[candidate] = (v[candidate] ?? 0) - delta;
        } else {
          minimum[candidate] = (minimum[candidate] ?? 0) - delta;
        }
      }
      column = nextColumn;
    } while ((matchedRow[column] ?? 0) !== 0);

    do {
      const prior = previousColumn[column] ?? 0;
      matchedRow[column] = matchedRow[prior] ?? 0;
      column = prior;
    } while (column !== 0);
  }

  const assignment = Array(rowCount).fill(-1) as number[];
  for (let column = 1; column <= columnCount; column += 1) {
    const row = matchedRow[column] ?? 0;
    if (row > 0) assignment[row - 1] = column - 1;
  }
  return assignment;
}

function evaluateRoster(
  players: readonly EvaluatedPlayer[],
  assumptions: TradeAssumptions
): RosterEvaluation {
  const expectedLineup = optimizeLineup(players, assumptions.rosterSettings, "expected");
  const shortTermLineup = optimizeLineup(players, assumptions.rosterSettings, "shortTerm");
  const floorLineup = optimizeLineup(players, assumptions.rosterSettings, "floor");
  const ceilingLineup = optimizeLineup(players, assumptions.rosterSettings, "ceiling");
  const bench = players.filter((player) => !expectedLineup.starterIds.has(player.playerId));
  const benchPoints = bench.reduce((total, player) => total + player.expected, 0);
  const benchValue = bench.reduce(
    (total, player) =>
      total + Math.max(0, player.expected - assumptions.replacementLevels[player.position]),
    0
  );
  const total = players.reduce((sum, player) => sum + player.expected, 0);
  return {
    expectedLineup,
    shortTermLineup,
    floorLineup,
    ceilingLineup,
    bench,
    points: {
      starters: expectedLineup.points,
      bench: round(benchPoints),
      total: round(total),
      benchValueAboveReplacement: round(benchValue),
      rosterContextValue: round(expectedLineup.points + benchValue)
    },
    risk: round(
      weightedAverage(
        players.map((player) => ({
          value: player.risk,
          weight: Math.max(1, Math.abs(player.expected))
        })),
        1
      )
    ),
    confidence: round(
      weightedAverage(
        players.map((player) => ({
          value: player.confidence,
          weight: Math.max(1, Math.abs(player.expected))
        })),
        0
      )
    )
  };
}

function makeReplacement(
  rosterId: string,
  sequence: number,
  position: TradePosition,
  assumptions: TradeAssumptions
): EvaluatedPlayer {
  const expected = assumptions.replacementLevels[position];
  const shortTerm = expected * (assumptions.shortTermWeeks / 17);
  return {
    playerId: `replacement:${rosterId}:${sequence}:${position}`,
    playerName: `${position} replacement assumption`,
    position,
    nflTeam: null,
    expected,
    shortTerm: round(shortTerm),
    floor: round(expected * 0.85),
    ceiling: round(expected * 1.15),
    confidence: 0.5,
    risk: 0.5,
    scarcity: 0,
    injuryStatus: "healthy",
    replacement: true
  };
}

function addBestReplacements(
  players: readonly EvaluatedPlayer[],
  count: number,
  rosterId: string,
  assumptions: TradeAssumptions
): { players: EvaluatedPlayer[]; added: EvaluatedPlayer[] } {
  const adjusted = [...players];
  const added: EvaluatedPlayer[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidates = POSITIONS.map((position) =>
      makeReplacement(rosterId, index + 1, position, assumptions)
    );
    const best = candidates
      .map((candidate) => ({
        candidate,
        value: evaluateRoster([...adjusted, candidate], assumptions).points.rosterContextValue
      }))
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.candidate.position.localeCompare(right.candidate.position)
      )[0]?.candidate;
    if (!best) break;
    adjusted.push(best);
    added.push(best);
  }
  return { players: adjusted, added };
}

function dropForRosterLimit(
  players: readonly EvaluatedPlayer[],
  count: number,
  protectedIds: ReadonlySet<string>,
  assumptions: TradeAssumptions,
  warnings: Set<string>,
  rosterName: string
): { players: EvaluatedPlayer[]; dropped: EvaluatedPlayer[] } {
  let adjusted = [...players];
  const dropped: EvaluatedPlayer[] = [];
  for (let index = 0; index < count; index += 1) {
    let candidates = adjusted.filter(
      (player) => !player.replacement && !protectedIds.has(player.playerId)
    );
    if (candidates.length === 0) {
      candidates = adjusted.filter((player) => !player.replacement);
      warnings.add(
        `${rosterName} has no unprotected player to drop after the trade; the least valuable acquired player is modeled as waived.`
      );
    }
    const bestRemoval = candidates
      .map((candidate) => ({
        candidate,
        value: evaluateRoster(
          adjusted.filter((player) => player.playerId !== candidate.playerId),
          assumptions
        ).points.rosterContextValue
      }))
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.candidate.playerName.localeCompare(right.candidate.playerName)
      )[0]?.candidate;
    if (!bestRemoval) break;
    adjusted = adjusted.filter((player) => player.playerId !== bestRemoval.playerId);
    dropped.push(bestRemoval);
  }
  return { players: adjusted, dropped };
}

function packageTotals(
  playerIds: readonly string[],
  evaluated: ReadonlyMap<string, EvaluatedPlayer>,
  assumptions: TradeAssumptions
): TradePackageTotals {
  const players = playerIds.flatMap((playerId) => {
    const player = evaluated.get(playerId);
    return player ? [player] : [];
  });
  const weight = (player: EvaluatedPlayer) => Math.max(1, Math.abs(player.expected));
  return {
    playerIds: [...playerIds],
    rawPlayerValue: round(players.reduce((total, player) => total + player.expected, 0)),
    shortTermValue: round(players.reduce((total, player) => total + player.shortTerm, 0)),
    floor: round(players.reduce((total, player) => total + player.floor, 0)),
    ceiling: round(players.reduce((total, player) => total + player.ceiling, 0)),
    replacementValue: round(
      players.reduce(
        (total, player) =>
          total + Math.max(0, player.expected - assumptions.replacementLevels[player.position]),
        0
      )
    ),
    positionalScarcity: round(
      weightedAverage(players.map((player) => ({ value: player.scarcity, weight: weight(player) })))
    ),
    risk: round(
      weightedAverage(
        players.map((player) => ({ value: player.risk, weight: weight(player) })),
        1
      )
    ),
    confidence: round(
      weightedAverage(
        players.map((player) => ({ value: player.confidence, weight: weight(player) }))
      )
    )
  };
}

function positionEffects(
  beforePlayers: readonly EvaluatedPlayer[],
  afterPlayers: readonly EvaluatedPlayer[],
  before: RosterEvaluation,
  after: RosterEvaluation
): TradePositionEffect[] {
  return POSITIONS.map((position) => {
    const beforeStarterPoints = before.expectedLineup.assignments
      .filter((assignment) => assignment.position === position)
      .reduce((total, assignment) => total + assignment.projectedPoints, 0);
    const afterStarterPoints = after.expectedLineup.assignments
      .filter((assignment) => assignment.position === position)
      .reduce((total, assignment) => total + assignment.projectedPoints, 0);
    return {
      position,
      beforeRosterCount: beforePlayers.filter((player) => player.position === position).length,
      afterRosterCount: afterPlayers.filter((player) => player.position === position).length,
      beforeStarterPoints: round(beforeStarterPoints),
      afterStarterPoints: round(afterStarterPoints),
      starterDelta: round(afterStarterPoints - beforeStarterPoints)
    };
  }).filter(
    (effect) =>
      effect.beforeRosterCount > 0 || effect.afterRosterCount > 0 || effect.starterDelta !== 0
  );
}

function rosterImpact(input: {
  roster: Roster;
  sends: readonly string[];
  receives: readonly string[];
  evaluated: ReadonlyMap<string, EvaluatedPlayer>;
  assumptions: TradeAssumptions;
  sentPackage: TradePackageTotals;
  receivedPackage: TradePackageTotals;
  warnings: Set<string>;
}): TradeRosterImpact {
  const beforePlayers = input.roster.playerIds.flatMap((playerId) => {
    const player = input.evaluated.get(playerId);
    return player ? [player] : [];
  });
  const before = evaluateRoster(beforePlayers, input.assumptions);
  const receivedPlayers = input.receives.flatMap((playerId) => {
    const player = input.evaluated.get(playerId);
    return player ? [player] : [];
  });
  let afterPlayers = [
    ...beforePlayers.filter((player) => !input.sends.includes(player.playerId)),
    ...receivedPlayers
  ];
  const targetCount = beforePlayers.length;
  let added: EvaluatedPlayer[] = [];
  let dropped: EvaluatedPlayer[] = [];
  if (afterPlayers.length < targetCount) {
    const result = addBestReplacements(
      afterPlayers,
      targetCount - afterPlayers.length,
      input.roster.rosterId,
      input.assumptions
    );
    afterPlayers = result.players;
    added = result.added;
  } else if (afterPlayers.length > targetCount) {
    const result = dropForRosterLimit(
      afterPlayers,
      afterPlayers.length - targetCount,
      new Set(input.receives),
      input.assumptions,
      input.warnings,
      input.roster.rosterName
    );
    afterPlayers = result.players;
    dropped = result.dropped;
  }
  const after = evaluateRoster(afterPlayers, input.assumptions);
  const projectedDelta = after.points.rosterContextValue - before.points.rosterContextValue;
  const rawPackageDelta = input.receivedPackage.rawPlayerValue - input.sentPackage.rawPlayerValue;
  const replacementValue = added.reduce((total, player) => total + player.expected, 0);
  const floorOutcome = after.floorLineup.points - before.floorLineup.points;
  const ceilingOutcome = after.ceilingLineup.points - before.ceilingLineup.points;
  const confidence = weightedAverage(
    input.receives.flatMap((playerId) => {
      const player = input.evaluated.get(playerId);
      return player ? [{ value: player.confidence, weight: Math.max(1, player.expected) }] : [];
    }),
    0
  );

  return {
    rosterId: input.roster.rosterId,
    rosterName: input.roster.rosterName,
    sendsPlayerIds: [...input.sends],
    receivesPlayerIds: [...input.receives],
    beforeStartingLineup: before.expectedLineup.assignments,
    afterStartingLineup: after.expectedLineup.assignments,
    beforeProjectedRosterPoints: before.points,
    afterProjectedRosterPoints: after.points,
    projectedRosterPointDelta: round(after.points.total - before.points.total),
    startingLineupValue: round(after.expectedLineup.points - before.expectedLineup.points),
    benchValue: round(
      after.points.benchValueAboveReplacement - before.points.benchValueAboveReplacement
    ),
    replacementValue: round(replacementValue),
    packageConsolidationValue: round(projectedDelta - rawPackageDelta),
    rosterContextValue: round(projectedDelta),
    shortTermOutlook: round(after.shortTermLineup.points - before.shortTermLineup.points),
    fullSeasonOutlook: round(after.expectedLineup.points - before.expectedLineup.points),
    bestPlausibleOutcome: round(Math.max(floorOutcome, ceilingOutcome)),
    worstPlausibleOutcome: round(Math.min(floorOutcome, ceilingOutcome)),
    riskBefore: before.risk,
    riskAfter: after.risk,
    riskDelta: round(after.risk - before.risk),
    confidence: round(confidence),
    addedReplacementPlayers: added.map((player) => ({
      playerId: player.playerId,
      position: player.position,
      assumedPoints: player.expected
    })),
    droppedPlayerIds: dropped.map((player) => player.playerId),
    beforeBenchPlayerIds: before.bench.map((player) => player.playerId),
    afterBenchPlayerIds: after.bench.map((player) => player.playerId),
    positionalEffects: positionEffects(beforePlayers, afterPlayers, before, after)
  };
}

function packageRiskComparison(
  sideA: TradePackageTotals,
  sideB: TradePackageTotals
): TradeEvaluation["riskComparison"] {
  return {
    sideAPackageRisk: sideA.risk,
    sideBPackageRisk: sideB.risk,
    lowerRiskPackage:
      Math.abs(sideA.risk - sideB.risk) < 0.005
        ? "equal"
        : sideA.risk < sideB.risk
          ? "sideA"
          : "sideB"
  };
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${round(value)}`;
}

function buildExplanation(
  assumptions: TradeAssumptions,
  sideA: TradeRosterImpact,
  sideB: TradeRosterImpact,
  warnings: readonly string[]
): string[] {
  return [
    ...(assumptions.mode === "generic"
      ? [
          `Generic mode is active: ${assumptions.teamCount}-team ${assumptions.scoringConfigurationIdentifier} assumptions are used because no league was selected.`
        ]
      : [
          `${assumptions.leagueName} settings and the ${assumptions.scoringConfigurationIdentifier} projection set are used.`
        ]),
    `${sideA.rosterName} receives ${sideA.receivesPlayerIds.length} player(s): starting-lineup value ${signed(sideA.startingLineupValue)}, bench value ${signed(sideA.benchValue)}, and full roster-context value ${signed(sideA.rosterContextValue)}.`,
    `${sideB.rosterName} receives ${sideB.receivesPlayerIds.length} player(s): starting-lineup value ${signed(sideB.startingLineupValue)}, bench value ${signed(sideB.benchValue)}, and full roster-context value ${signed(sideB.rosterContextValue)}.`,
    `Open roster spots are filled with disclosed replacement assumptions; excess players are modeled as drops before comparing legal, equal-size rosters.`,
    `The evaluation compares optimized lineups, bench value above replacement, uncertainty, availability, and roster fit. It does not declare fairness from a summed trade-chart score.`,
    ...(warnings.length > 0
      ? [`Review ${warnings.length} missing-data or compatibility warning(s) before acting.`]
      : [])
  ];
}

export interface TradeEngine {
  evaluate(input: unknown): TradeEvaluation;
}

/**
 * Deep, deterministic trade-analysis module. Callers provide normalized data once and receive
 * package, lineup, bench, replacement, risk, and roster-context analysis through one interface.
 */
export function createTradeEngine(): TradeEngine {
  return {
    evaluate(input) {
      const parsed = tradeEngineInputSchema.parse(input);
      const assumptions = resolveAssumptions(parsed);
      const warnings = new Set<string>();
      const evaluated = evaluatePlayers(parsed, assumptions, warnings);
      const sideAPackage = packageTotals(parsed.trade.sideA.playerIds, evaluated, assumptions);
      const sideBPackage = packageTotals(parsed.trade.sideB.playerIds, evaluated, assumptions);
      const rosters = new Map(parsed.currentRosters.map((roster) => [roster.rosterId, roster]));
      const sideARoster = rosters.get(parsed.trade.sideA.rosterId);
      const sideBRoster = rosters.get(parsed.trade.sideB.rosterId);
      if (!sideARoster || !sideBRoster) {
        throw new Error("Validated trade rosters could not be resolved.");
      }
      const sideAImpact = rosterImpact({
        roster: sideARoster,
        sends: parsed.trade.sideA.playerIds,
        receives: parsed.trade.sideB.playerIds,
        evaluated,
        assumptions,
        sentPackage: sideAPackage,
        receivedPackage: sideBPackage,
        warnings
      });
      const sideBImpact = rosterImpact({
        roster: sideBRoster,
        sends: parsed.trade.sideB.playerIds,
        receives: parsed.trade.sideA.playerIds,
        evaluated,
        assumptions,
        sentPackage: sideBPackage,
        receivedPackage: sideAPackage,
        warnings
      });
      const warningList = [...warnings].sort();
      return {
        mode: assumptions.mode,
        assumptions,
        packages: {
          sideA: sideAPackage,
          sideB: sideBPackage
        },
        rosterImpacts: {
          sideA: sideAImpact,
          sideB: sideBImpact
        },
        riskComparison: packageRiskComparison(sideAPackage, sideBPackage),
        confidence: round(
          weightedAverage([
            { value: sideAPackage.confidence, weight: sideAPackage.playerIds.length },
            { value: sideBPackage.confidence, weight: sideBPackage.playerIds.length }
          ])
        ),
        missingDataWarnings: warningList,
        explanation: buildExplanation(assumptions, sideAImpact, sideBImpact, warningList)
      };
    }
  };
}
