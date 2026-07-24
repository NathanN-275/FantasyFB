import { describe, expect, it, vi } from "vitest";
import { createProjectionEngine, projectionRunExportSchema } from "./index.js";

const generatedAt = new Date("2026-07-23T12:00:00.000Z");

function persistedProjection() {
  return {
    playerId: "player-1",
    seasonId: "season-2026",
    projectedGames: "16.2",
    projectedStatistics: { receiving_yards: 1080 },
    projectedPoints: "244.5",
    projectedPointsPerGame: "15.0926",
    floorPoints: "201.1",
    medianPoints: "244.5",
    ceilingPoints: "287.9",
    confidence: "0.82",
    projectionKind: "model" as const,
    modelVersion: "transparent-baseline-v1.0.0",
    featureVersion: "position-features-v1.0.0",
    scoringConfigurationIdentifier: "full-ppr-v1",
    generatedAt
  };
}

function projectionExport() {
  return {
    run_id: "2f56e6b5-d3ef-55ca-a4ae-f479e0f06942",
    dataset_version_id: "dataset-v1",
    target_season: 2026,
    visibility: "public",
    owner_user_id: null,
    model_version: "transparent-baseline-v1.0.0",
    feature_version: "position-features-v1.0.0",
    scoring_configuration_identifier: "full-ppr-v1",
    training_start_season: 2022,
    training_end_season: 2025,
    generated_at: "2026-07-23T12:00:00+00:00",
    parameters_by_position: {
      WR: { recent_weight: 0.75, position_shrinkage: 0.1 }
    },
    backtest: {
      model_comparison: {
        final_model: { sample_size: 24, mean_absolute_error: 18.4 }
      }
    },
    projections: [
      {
        player_id: "player-1",
        player_name: "Example Receiver",
        position: "WR",
        team_id: "TST",
        season: 2026,
        projected_games: 16.2,
        projected_statistics: { receiving_yards: 1080 },
        projected_fantasy_points: 244.5,
        projected_points_per_game: 15.0926,
        floor: 201.1,
        median: 244.5,
        ceiling: 287.9,
        confidence: 0.82,
        model_version: "transparent-baseline-v1.0.0",
        feature_version: "position-features-v1.0.0",
        generated_at: "2026-07-23T12:00:00+00:00",
        scoring_configuration_identifier: "full-ppr-v1",
        features: {
          history_seasons: 3,
          recent_receiving_yards: 1050,
          weighted_receiving_yards: 1012
        }
      }
    ]
  };
}

describe("ProjectionEngine", () => {
  it("returns complete persisted projections through one read boundary", async () => {
    const repository = {
      listForSeason: vi.fn().mockResolvedValue([persistedProjection()])
    };
    const engine = createProjectionEngine(repository);
    const query = { seasonId: "season-2026", visibility: "public" as const };

    await expect(engine.forSeason(query)).resolves.toEqual([persistedProjection()]);
    expect(repository.listForSeason).toHaveBeenCalledWith(query);
  });

  it("rejects inconsistent persisted uncertainty bounds", async () => {
    const repository = {
      listForSeason: vi.fn().mockResolvedValue([
        {
          ...persistedProjection(),
          floorPoints: "250",
          medianPoints: "240"
        }
      ])
    };

    await expect(
      createProjectionEngine(repository).forSeason({
        seasonId: "season-2026",
        visibility: "public"
      })
    ).rejects.toThrow("inconsistent");
  });
});

describe("projectionRunExportSchema", () => {
  it("accepts the versioned Python projection export contract", () => {
    expect(projectionRunExportSchema.parse(projectionExport()).projections).toHaveLength(1);
  });

  it("rejects cross-run metadata mismatches", () => {
    const value = projectionExport();
    value.projections[0]!.feature_version = "future-features";

    expect(() => projectionRunExportSchema.parse(value)).toThrow(
      "Projection metadata must match its run"
    );
  });
});
