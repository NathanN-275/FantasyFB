"""Command-line entry point for reproducible projection runs."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, Mapping, Sequence

from projection import (
    JsonHistoricalProjectionDataSource,
    JsonProjectionRepository,
    PlayerContext,
    PostgresProjectionDataSource,
    PostgresProjectionRepository,
    ProjectionRequest,
    ProjectionService,
    ScoringConfiguration,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate transparent season projections.")
    parser.add_argument("--target-season", type=int, required=True)
    parser.add_argument("--dataset-version-id", required=True)
    parser.add_argument("--scoring-config", type=Path, required=True)
    parser.add_argument("--context", type=Path)
    parser.add_argument("--historical-state", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--visibility", choices=("public", "sample", "private"), default="public")
    parser.add_argument("--owner-user-id")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scoring = ScoringConfiguration.from_mapping(_load_object(args.scoring_config))
    contexts = _load_contexts(args.context) if args.context else ()
    if args.historical_state:
        if not args.output:
            raise SystemExit("--output is required with --historical-state.")
        source = JsonHistoricalProjectionDataSource(args.historical_state)
        repository = JsonProjectionRepository(args.output)
    elif args.database_url:
        if args.output:
            raise SystemExit("--output is only supported with --historical-state.")
        source = PostgresProjectionDataSource(args.database_url)
        repository = PostgresProjectionRepository(args.database_url)
    else:
        raise SystemExit("Provide --historical-state or DATABASE_URL/--database-url.")

    run = ProjectionService(source, repository).generate(
        ProjectionRequest(
            target_season=args.target_season,
            dataset_version_id=args.dataset_version_id,
            scoring=scoring,
            contexts=contexts,
            visibility=args.visibility,
            owner_user_id=args.owner_user_id,
            generated_at=datetime.now(timezone.utc),
        )
    )
    print(
        json.dumps(
            {
                "run_id": run.run_id,
                "target_season": run.target_season,
                "projection_count": len(run.projections),
                "model_version": run.model_version,
                "feature_version": run.feature_version,
                "training_range": [
                    run.training_start_season,
                    run.training_end_season,
                ],
            },
            sort_keys=True,
        )
    )


def _load_object(path: Path) -> Mapping[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, Mapping):
        raise ValueError(f"{path} must contain a JSON object.")
    return value


def _load_contexts(path: Path) -> Sequence[PlayerContext]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, list):
        raise ValueError(f"{path} must contain a JSON array.")
    contexts = []
    for row in value:
        if not isinstance(row, Mapping):
            raise ValueError("Every player context must be an object.")
        contexts.append(
            PlayerContext(
                player_id=_string(row, "player_id"),
                player_name=_string(row, "player_name"),
                position=_string(row, "position").upper(),
                team_id=_string(row, "team_id"),
                age=_optional_number(row.get("age")),
                experience=_optional_number(row.get("experience")),
                expected_role=_optional_number(row.get("expected_role")),
                injury_games_missed=_optional_number(row.get("injury_games_missed")),
                team_changed=_optional_bool(row.get("team_changed")),
                quarterback_changed=_optional_bool(row.get("quarterback_changed")),
            )
        )
    return contexts


def _string(row: Mapping[str, Any], name: str) -> str:
    value = row.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Player context {name} must be a non-empty string.")
    return value.strip()


def _optional_number(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Optional player context numeric values must be numbers.")
    return float(value)


def _optional_bool(value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    raise ValueError("Optional player context flags must be booleans.")


if __name__ == "__main__":
    main()
