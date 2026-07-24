import type {
  ProjectionRecord,
  ProjectionRepository,
  VisibleSeasonQuery
} from "@fantasyfb/contracts";
import { z } from "zod";

const finiteNumber = z.number().finite();
const positionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DEF"]);

export const projectionOutputExportSchema = z
  .object({
    player_id: z.string().min(1),
    player_name: z.string().min(1),
    position: positionSchema,
    team_id: z.string().min(1),
    season: z.number().int().min(1920).max(2100),
    projected_games: finiteNumber.min(0).max(17),
    projected_statistics: z.record(z.string().min(1), finiteNumber),
    projected_fantasy_points: finiteNumber,
    projected_points_per_game: finiteNumber,
    floor: finiteNumber.min(0),
    median: finiteNumber.min(0),
    ceiling: finiteNumber.min(0),
    confidence: finiteNumber.min(0).max(1),
    model_version: z.string().min(1),
    feature_version: z.string().min(1),
    generated_at: z.string().datetime({ offset: true }),
    scoring_configuration_identifier: z.string().min(1),
    features: z.record(z.string().min(1), finiteNumber)
  })
  .strict()
  .refine((record) => record.floor <= record.median && record.median <= record.ceiling, {
    message: "Projection bounds must satisfy floor <= median <= ceiling."
  });

export const projectionRunExportSchema = z
  .object({
    run_id: z.string().uuid(),
    dataset_version_id: z.string().min(1),
    target_season: z.number().int().min(1920).max(2100),
    visibility: z.enum(["public", "sample", "private"]),
    owner_user_id: z.string().nullable(),
    model_version: z.string().min(1),
    feature_version: z.string().min(1),
    scoring_configuration_identifier: z.string().min(1),
    training_start_season: z.number().int().min(1920).max(2100),
    training_end_season: z.number().int().min(1920).max(2100),
    generated_at: z.string().datetime({ offset: true }),
    parameters_by_position: z.record(
      positionSchema,
      z.object({
        recent_weight: finiteNumber.min(0).max(1),
        position_shrinkage: finiteNumber.min(0).max(1)
      })
    ),
    backtest: z.record(z.string(), z.unknown()),
    projections: z.array(projectionOutputExportSchema).min(1)
  })
  .strict()
  .superRefine((run, context) => {
    if (run.training_end_season >= run.target_season) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["training_end_season"],
        message: "Training must end before the target season."
      });
    }
    if (run.visibility === "private" && !run.owner_user_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["owner_user_id"],
        message: "Private projection exports require an owner."
      });
    }
    run.projections.forEach((projection, index) => {
      const mismatched =
        projection.season !== run.target_season ||
        projection.model_version !== run.model_version ||
        projection.feature_version !== run.feature_version ||
        projection.scoring_configuration_identifier !== run.scoring_configuration_identifier;
      if (mismatched) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projections", index],
          message: "Projection metadata must match its run."
        });
      }
    });
  });

export type ProjectionRunExport = z.infer<typeof projectionRunExportSchema>;

/** Read-only application boundary for already-generated and persisted projections. */
export class ProjectionEngine {
  constructor(private readonly repository: ProjectionRepository) {}

  async forSeason(input: VisibleSeasonQuery): Promise<ProjectionRecord[]> {
    const records = await this.repository.listForSeason(input);
    records.forEach(validatePersistedProjection);
    return records;
  }
}

export function createProjectionEngine(repository: ProjectionRepository): ProjectionEngine {
  return new ProjectionEngine(repository);
}

function validatePersistedProjection(record: ProjectionRecord): void {
  const requiredMetadata = [
    record.modelVersion,
    record.featureVersion,
    record.scoringConfigurationIdentifier
  ];
  if (record.projectionKind === "model" && requiredMetadata.some((value) => !value)) {
    throw new Error(`Model projection for ${record.playerId} is missing version metadata.`);
  }
  const numeric = [
    ["projectedGames", record.projectedGames],
    ["projectedPoints", record.projectedPoints],
    ["projectedPointsPerGame", record.projectedPointsPerGame],
    ["floorPoints", record.floorPoints],
    ["medianPoints", record.medianPoints],
    ["ceilingPoints", record.ceilingPoints],
    ["confidence", record.confidence]
  ] as const;
  for (const [name, value] of numeric) {
    if (value !== null && !Number.isFinite(Number(value))) {
      throw new Error(`Projection ${name} for ${record.playerId} must be finite.`);
    }
  }
  if (
    record.floorPoints !== null &&
    record.medianPoints !== null &&
    record.ceilingPoints !== null &&
    !(
      Number(record.floorPoints) <= Number(record.medianPoints) &&
      Number(record.medianPoints) <= Number(record.ceilingPoints)
    )
  ) {
    throw new Error(`Projection bounds for ${record.playerId} are inconsistent.`);
  }
}
