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
const RANKING_KINDS = ["model", "expert", "hybrid"] as const;
const SORT_FIELDS = ["modelRank", "name", "projection", "adp", "risk", "confidence"] as const;

const finiteNumber = z.number().finite();
const dateSchema = z.coerce.date();
const optionalUrl = z.string().url().optional();

const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    sourceIdentifier: z.string().min(1),
    sourceUrl: optionalUrl,
    datasetVersion: z.string().min(1),
    retrievedAt: dateSchema,
    effectiveAt: dateSchema.optional(),
    staleAfterDays: finiteNumber.nonnegative(),
    licenseOrUsageNote: z.string().min(1),
    isSample: z.boolean()
  })
  .strict();

const projectionSchema = z
  .object({
    kind: z.enum(["model", "expert"]),
    projectedGames: finiteNumber.min(0).max(17),
    projectedStatistics: z.record(z.string().min(1), finiteNumber),
    projectedPoints: finiteNumber,
    projectedPointsPerGame: finiteNumber,
    floor: finiteNumber,
    median: finiteNumber,
    ceiling: finiteNumber,
    confidence: finiteNumber.min(0).max(1),
    sourceId: z.string().min(1),
    modelVersion: z.string().min(1).optional()
  })
  .strict()
  .refine((projection) => projection.floor <= projection.median, {
    message: "Projection floor cannot exceed its median."
  })
  .refine((projection) => projection.median <= projection.ceiling, {
    message: "Projection median cannot exceed its ceiling."
  });

const rankingSchema = z
  .object({
    kind: z.enum(RANKING_KINDS),
    overallRank: z.number().int().positive(),
    positionRank: z.number().int().positive(),
    sourceId: z.string().min(1)
  })
  .strict();

const playerSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    fullName: z.string().min(1),
    position: z.enum(POSITIONS),
    team: z
      .object({
        id: z.string().min(1),
        abbreviation: z.string().min(2).max(4),
        name: z.string().min(1)
      })
      .strict(),
    byeWeek: z.number().int().min(1).max(18),
    injury: z
      .object({
        status: z.enum(INJURY_STATUSES),
        detail: z.string().min(1).optional()
      })
      .strict(),
    historicalSeasons: z
      .array(
        z
          .object({
            season: z.number().int().min(1920).max(2100),
            games: z.number().int().min(0).max(25),
            fantasyPoints: finiteNumber,
            statistics: z.record(z.string().min(1), finiteNumber),
            sourceId: z.string().min(1)
          })
          .strict()
      )
      .default([]),
    projections: z.array(projectionSchema).default([]),
    rankings: z.array(rankingSchema).default([]),
    adp: z
      .object({
        overall: finiteNumber.positive(),
        positional: finiteNumber.positive(),
        provider: z.string().min(1),
        sourceId: z.string().min(1)
      })
      .strict()
      .optional(),
    risk: z
      .object({
        score: finiteNumber.min(0).max(100),
        factors: z.array(z.string().min(1))
      })
      .strict(),
    news: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            summary: z.string().min(1),
            sourceUrl: z.string().url(),
            publishedAt: dateSchema,
            sourceId: z.string().min(1)
          })
          .strict()
      )
      .default([])
  })
  .strict();

export const playerIntelligenceDatasetSchema = z
  .object({
    season: z.number().int().min(1920).max(2100),
    asOf: dateSchema,
    label: z.string().min(1),
    sources: z.array(sourceSchema).min(1),
    players: z.array(playerSchema).min(1)
  })
  .strict()
  .superRefine((dataset, context) => {
    const sourceIds = new Set<string>();
    dataset.sources.forEach((source, index) => {
      if (sourceIds.has(source.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "id"],
          message: `Duplicate source ID: ${source.id}`
        });
      }
      sourceIds.add(source.id);
      if (source.retrievedAt > dataset.asOf) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "retrievedAt"],
          message: `Source ${source.id} cannot be retrieved after the dataset evaluation time.`
        });
      }
    });

    const playerIds = new Set<string>();
    const slugs = new Set<string>();
    dataset.players.forEach((player, playerIndex) => {
      if (playerIds.has(player.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["players", playerIndex, "id"],
          message: `Duplicate player ID: ${player.id}`
        });
      }
      if (slugs.has(player.slug)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["players", playerIndex, "slug"],
          message: `Duplicate player slug: ${player.slug}`
        });
      }
      playerIds.add(player.id);
      slugs.add(player.slug);

      reportDuplicateKinds(
        player.projections.map((projection) => projection.kind),
        ["players", playerIndex, "projections"],
        "projection kind",
        context
      );
      reportDuplicateKinds(
        player.rankings.map((ranking) => ranking.kind),
        ["players", playerIndex, "rankings"],
        "ranking kind",
        context
      );

      const referencedSources = [
        ...player.historicalSeasons.map((record) => record.sourceId),
        ...player.projections.map((record) => record.sourceId),
        ...player.rankings.map((record) => record.sourceId),
        ...player.news.map((record) => record.sourceId),
        ...(player.adp ? [player.adp.sourceId] : [])
      ];
      referencedSources.forEach((sourceId) => {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["players", playerIndex],
            message: `Player ${player.id} references unknown source ${sourceId}.`
          });
        }
      });
    });
  });

const directoryQuerySchema = z
  .object({
    search: z.string().trim().default(""),
    positions: z.array(z.enum(POSITIONS)).default([]),
    teams: z.array(z.string().min(1)).default([]),
    byeWeeks: z.array(z.number().int().min(1).max(18)).default([]),
    rankingKinds: z.array(z.enum(RANKING_KINDS)).default([]),
    injuryStatuses: z.array(z.enum(INJURY_STATUSES)).default([]),
    sort: z.enum(SORT_FIELDS).default("modelRank"),
    direction: z.enum(["asc", "desc"]).optional()
  })
  .strict();

export type PlayerIntelligenceDataset = z.input<typeof playerIntelligenceDatasetSchema>;
export type PlayerIntelligenceDirectoryQuery = z.input<typeof directoryQuerySchema>;
export type PlayerPosition = (typeof POSITIONS)[number];
export type InjuryStatus = (typeof INJURY_STATUSES)[number];
export type RankingKind = (typeof RANKING_KINDS)[number];
export type DirectorySort = (typeof SORT_FIELDS)[number];

export interface PlayerDataSource {
  readonly id: string;
  readonly label: string;
  readonly sourceIdentifier: string;
  readonly sourceUrl?: string | undefined;
  readonly datasetVersion: string;
  readonly retrievedAt: Date;
  readonly effectiveAt?: Date | undefined;
  readonly staleAfterDays: number;
  readonly licenseOrUsageNote: string;
  readonly isSample: boolean;
  readonly freshness: "current" | "stale";
  readonly ageInDays: number;
}

export interface PlayerProjection {
  readonly kind: "model" | "expert";
  readonly projectedGames: number;
  readonly projectedStatistics: Readonly<Record<string, number>>;
  readonly projectedPoints: number;
  readonly projectedPointsPerGame: number;
  readonly floor: number;
  readonly median: number;
  readonly ceiling: number;
  readonly confidence: number;
  readonly sourceId: string;
  readonly modelVersion?: string | undefined;
}

export interface PlayerRanking {
  readonly kind: RankingKind;
  readonly overallRank: number;
  readonly positionRank: number;
  readonly sourceId: string;
}

export interface PlayerEvaluation {
  readonly id: string;
  readonly slug: string;
  readonly fullName: string;
  readonly position: PlayerPosition;
  readonly team: {
    readonly id: string;
    readonly abbreviation: string;
    readonly name: string;
  };
  readonly byeWeek: number;
  readonly injury: {
    readonly status: InjuryStatus;
    readonly detail?: string | undefined;
  };
  readonly historicalSeasons: readonly {
    readonly season: number;
    readonly games: number;
    readonly fantasyPoints: number;
    readonly statistics: Readonly<Record<string, number>>;
    readonly sourceId: string;
  }[];
  readonly projections: readonly PlayerProjection[];
  readonly rankings: readonly PlayerRanking[];
  readonly adp?:
    | {
        readonly overall: number;
        readonly positional: number;
        readonly provider: string;
        readonly sourceId: string;
      }
    | undefined;
  readonly risk: {
    readonly score: number;
    readonly level: "low" | "medium" | "high";
    readonly factors: readonly string[];
  };
  readonly confidence?: number | undefined;
  readonly news: readonly {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly sourceUrl: string;
    readonly publishedAt: Date;
    readonly sourceId: string;
  }[];
  readonly comparisons: {
    readonly modelVersusExpertPoints?: number | undefined;
    readonly modelVersusExpertRank?: number | undefined;
    readonly modelVersusAdp?: number | undefined;
  };
  readonly sources: readonly PlayerDataSource[];
  readonly dataHealth: {
    readonly state: "complete" | "partial" | "stale";
    readonly missing: readonly string[];
    readonly warnings: readonly string[];
  };
}

export interface PlayerDirectoryEntry {
  readonly id: string;
  readonly slug: string;
  readonly fullName: string;
  readonly position: PlayerPosition;
  readonly team: PlayerEvaluation["team"];
  readonly byeWeek: number;
  readonly injury: PlayerEvaluation["injury"];
  readonly modelProjection?: number | undefined;
  readonly modelRank?: number | undefined;
  readonly expertRank?: number | undefined;
  readonly hybridRank?: number | undefined;
  readonly adp?: number | undefined;
  readonly risk: PlayerEvaluation["risk"];
  readonly confidence?: number | undefined;
  readonly dataHealth: PlayerEvaluation["dataHealth"];
}

export interface PlayerDirectory {
  readonly label: string;
  readonly season: number;
  readonly asOf: Date;
  readonly total: number;
  readonly players: readonly PlayerDirectoryEntry[];
  readonly filters: {
    readonly positions: readonly PlayerPosition[];
    readonly teams: readonly { readonly abbreviation: string; readonly name: string }[];
    readonly byeWeeks: readonly number[];
    readonly rankingKinds: readonly RankingKind[];
    readonly injuryStatuses: readonly InjuryStatus[];
  };
}

/**
 * Complete player-research interface. Callers provide one normalized, versioned
 * dataset and receive evaluated directory/profile views without reproducing
 * filtering, comparison, risk, freshness, or missing-data rules.
 */
export class PlayerIntelligence {
  readonly #dataset: z.output<typeof playerIntelligenceDatasetSchema>;
  readonly #evaluations: readonly PlayerEvaluation[];

  constructor(input: PlayerIntelligenceDataset) {
    this.#dataset = playerIntelligenceDatasetSchema.parse(input);
    const sources = new Map(
      this.#dataset.sources.map((source) => [
        source.id,
        evaluateSourceFreshness(source, this.#dataset.asOf)
      ])
    );
    this.#evaluations = this.#dataset.players.map((player) => evaluatePlayer(player, sources));
  }

  directory(input: PlayerIntelligenceDirectoryQuery = {}): PlayerDirectory {
    const query = directoryQuerySchema.parse(input);
    const search = query.search.toLocaleLowerCase();
    const defaultDirection = ["name", "modelRank", "adp", "risk"].includes(query.sort)
      ? "asc"
      : "desc";
    const direction = query.direction ?? defaultDirection;
    const filtered = this.#evaluations
      .filter((player) => {
        const matchesSearch =
          !search ||
          player.fullName.toLocaleLowerCase().includes(search) ||
          player.team.name.toLocaleLowerCase().includes(search) ||
          player.team.abbreviation.toLocaleLowerCase().includes(search);
        const matchesPosition =
          query.positions.length === 0 || query.positions.includes(player.position);
        const matchesTeam =
          query.teams.length === 0 || query.teams.includes(player.team.abbreviation);
        const matchesBye = query.byeWeeks.length === 0 || query.byeWeeks.includes(player.byeWeek);
        const matchesRanking =
          query.rankingKinds.length === 0 ||
          query.rankingKinds.every((kind) =>
            player.rankings.some((ranking) => ranking.kind === kind)
          );
        const matchesInjury =
          query.injuryStatuses.length === 0 || query.injuryStatuses.includes(player.injury.status);
        return (
          matchesSearch &&
          matchesPosition &&
          matchesTeam &&
          matchesBye &&
          matchesRanking &&
          matchesInjury
        );
      })
      .map(toDirectoryEntry)
      .sort((left, right) => compareEntries(left, right, query.sort, direction));

    return {
      label: this.#dataset.label,
      season: this.#dataset.season,
      asOf: this.#dataset.asOf,
      total: filtered.length,
      players: filtered,
      filters: buildFilterOptions(this.#evaluations)
    };
  }

  profile(playerIdOrSlug: string): PlayerEvaluation | undefined {
    return this.#evaluations.find(
      (player) => player.id === playerIdOrSlug || player.slug === playerIdOrSlug
    );
  }
}

export function createPlayerIntelligence(input: PlayerIntelligenceDataset): PlayerIntelligence {
  return new PlayerIntelligence(input);
}

function evaluateSourceFreshness(
  source: z.output<typeof sourceSchema>,
  asOf: Date
): PlayerDataSource {
  const millisecondsPerDay = 86_400_000;
  const ageInDays = Math.max(
    0,
    Math.floor((asOf.getTime() - source.retrievedAt.getTime()) / millisecondsPerDay)
  );
  return {
    ...source,
    freshness: ageInDays > source.staleAfterDays ? "stale" : "current",
    ageInDays
  };
}

function evaluatePlayer(
  player: z.output<typeof playerSchema>,
  sourcesById: ReadonlyMap<string, PlayerDataSource>
): PlayerEvaluation {
  const modelProjection = player.projections.find((projection) => projection.kind === "model");
  const expertProjection = player.projections.find((projection) => projection.kind === "expert");
  const modelRanking = player.rankings.find((ranking) => ranking.kind === "model");
  const expertRanking = player.rankings.find((ranking) => ranking.kind === "expert");
  const referencedSourceIds = new Set([
    ...player.historicalSeasons.map((record) => record.sourceId),
    ...player.projections.map((record) => record.sourceId),
    ...player.rankings.map((record) => record.sourceId),
    ...player.news.map((record) => record.sourceId),
    ...(player.adp ? [player.adp.sourceId] : [])
  ]);
  const sources = [...referencedSourceIds].map((id) => {
    const source = sourcesById.get(id);
    if (!source) throw new Error(`Missing source ${id} after dataset validation.`);
    return source;
  });
  const missing = [
    ...(player.historicalSeasons.length ? [] : ["historical statistics"]),
    ...(modelProjection ? [] : ["model projection"]),
    ...(expertProjection ? [] : ["expert projection"]),
    ...(modelRanking ? [] : ["model rank"]),
    ...(expertRanking ? [] : ["expert rank"]),
    ...(player.rankings.some((ranking) => ranking.kind === "hybrid") ? [] : ["hybrid rank"]),
    ...(player.adp ? [] : ["ADP"]),
    ...(player.news.length ? [] : ["news"])
  ];
  const staleSources = sources.filter((source) => source.freshness === "stale");
  const warnings = staleSources.map(
    (source) => `${source.label} is stale (${source.ageInDays} days old).`
  );
  const level = player.risk.score >= 67 ? "high" : player.risk.score >= 34 ? "medium" : "low";

  return {
    ...player,
    risk: { ...player.risk, level },
    ...(modelProjection ? { confidence: modelProjection.confidence } : {}),
    comparisons: {
      ...(modelProjection && expertProjection
        ? {
            modelVersusExpertPoints:
              modelProjection.projectedPoints - expertProjection.projectedPoints
          }
        : {}),
      ...(modelRanking && expertRanking
        ? { modelVersusExpertRank: expertRanking.overallRank - modelRanking.overallRank }
        : {}),
      ...(modelRanking && player.adp
        ? { modelVersusAdp: player.adp.overall - modelRanking.overallRank }
        : {})
    },
    sources,
    dataHealth: {
      state: staleSources.length ? "stale" : missing.length ? "partial" : "complete",
      missing,
      warnings
    }
  };
}

function toDirectoryEntry(player: PlayerEvaluation): PlayerDirectoryEntry {
  return {
    id: player.id,
    slug: player.slug,
    fullName: player.fullName,
    position: player.position,
    team: player.team,
    byeWeek: player.byeWeek,
    injury: player.injury,
    modelProjection: player.projections.find((projection) => projection.kind === "model")
      ?.projectedPoints,
    modelRank: player.rankings.find((ranking) => ranking.kind === "model")?.overallRank,
    expertRank: player.rankings.find((ranking) => ranking.kind === "expert")?.overallRank,
    hybridRank: player.rankings.find((ranking) => ranking.kind === "hybrid")?.overallRank,
    adp: player.adp?.overall,
    risk: player.risk,
    confidence: player.confidence,
    dataHealth: player.dataHealth
  };
}

function compareEntries(
  left: PlayerDirectoryEntry,
  right: PlayerDirectoryEntry,
  sort: DirectorySort,
  direction: "asc" | "desc"
): number {
  const factor = direction === "asc" ? 1 : -1;
  if (sort === "name") return factor * left.fullName.localeCompare(right.fullName);
  const leftValue = sortableValue(left, sort);
  const rightValue = sortableValue(right, sort);
  if (leftValue === undefined && rightValue === undefined) {
    return left.fullName.localeCompare(right.fullName);
  }
  if (leftValue === undefined) return 1;
  if (rightValue === undefined) return -1;
  const compared = (leftValue - rightValue) * factor;
  return compared || left.fullName.localeCompare(right.fullName);
}

function sortableValue(entry: PlayerDirectoryEntry, sort: DirectorySort): number | undefined {
  switch (sort) {
    case "modelRank":
      return entry.modelRank;
    case "projection":
      return entry.modelProjection;
    case "adp":
      return entry.adp;
    case "risk":
      return entry.risk.score;
    case "confidence":
      return entry.confidence;
    case "name":
      return undefined;
  }
}

function buildFilterOptions(players: readonly PlayerEvaluation[]): PlayerDirectory["filters"] {
  const positions = unique(players.map((player) => player.position)).sort(
    (left, right) => POSITIONS.indexOf(left) - POSITIONS.indexOf(right)
  );
  const teamsByAbbreviation = new Map(
    players.map((player) => [
      player.team.abbreviation,
      { abbreviation: player.team.abbreviation, name: player.team.name }
    ])
  );
  const rankingKinds = RANKING_KINDS.filter((kind) =>
    players.some((player) => player.rankings.some((ranking) => ranking.kind === kind))
  );
  return {
    positions,
    teams: [...teamsByAbbreviation.values()].sort((left, right) =>
      left.abbreviation.localeCompare(right.abbreviation)
    ),
    byeWeeks: unique(players.map((player) => player.byeWeek)).sort((left, right) => left - right),
    rankingKinds,
    injuryStatuses: unique(players.map((player) => player.injury.status)).sort(
      (left, right) => INJURY_STATUSES.indexOf(left) - INJURY_STATUSES.indexOf(right)
    )
  };
}

function unique<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

function reportDuplicateKinds(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message: `Duplicate ${label}: ${value}`
      });
    }
    seen.add(value);
  });
}
