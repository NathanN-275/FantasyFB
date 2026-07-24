# Projection pipeline

This directory contains version one of the transparent season projection system.
`projection.py` is the application-independent modeling module and
`run_projection.py` is its narrow CLI. Inputs must already be normalized by the
historical-data pipeline; provider records are not accepted.

## Reproducible local run

Create a normalized multi-season state file with the historical pipeline, then run:

```bash
.venv/bin/python pipelines/projections/run_projection.py \
  --target-season 2026 \
  --dataset-version-id <postgres-dataset-version-uuid> \
  --historical-state .local/historical-data.json \
  --scoring-config pipelines/projections/fixtures/full-ppr.json \
  --output .local/projection-run-2026.json
```

The scoring file is required. The pipeline never silently chooses PPR, half-PPR,
standard, or another scoring configuration. An optional JSON `--context` array can
provide current team, expected role, age, experience, injury games missed, team
change, and quarterback change inputs.

For PostgreSQL, omit `--historical-state` and `--output`, and set `DATABASE_URL`.
The command reads normalized `season_statistics` and `team_season_statistics`, then
writes one `projection_runs` row and its `player_projections` rows in a transaction.

## Verification

```bash
.venv/bin/python -m pytest pipelines/projections
.venv/bin/python -m ruff check pipelines/projections
pnpm --filter @fantasyfb/projection-engine test
pnpm --filter @fantasyfb/projection-engine typecheck
```

Each exported run contains model/feature versions, its training-season range,
walk-forward model comparisons, calibration measurements, selected position
parameters, scoring identifier, and validated player outputs. See
[`docs/model-methodology`](../../docs/model-methodology/README.md) for the method,
feature rationale, evidence, and limitations.
