from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest


PIPELINE_DIRECTORY = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location(
    "transparent_projection", PIPELINE_DIRECTORY / "projection.py"
)
assert SPEC and SPEC.loader
projection = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = projection
SPEC.loader.exec_module(projection)


SCORING = projection.ScoringConfiguration.from_mapping(
    {
        "identifier": "test-ppr",
        "stat_points": {
            "passing_yards": 0.04,
            "passing_touchdowns": 4,
            "interceptions": -2,
            "rushing_yards": 0.1,
            "rushing_touchdowns": 6,
            "receptions": 1,
            "receiving_yards": 0.1,
            "receiving_touchdowns": 6,
            "field_goals_made": 3,
            "extra_points_made": 1,
            "defensive_sacks": 1,
            "defensive_interceptions": 2,
            "defensive_fumble_recoveries": 2,
            "defensive_touchdowns": 6,
        },
    }
)


class MemorySource:
    def __init__(self, players, teams=()):
        self.players = players
        self.teams = teams
        self.requested_before = []

    def load_player_seasons(self, before_season):
        self.requested_before.append(before_season)
        return [record for record in self.players if record.season < before_season]

    def load_team_seasons(self, before_season):
        return [record for record in self.teams if record.season < before_season]


class LeakySource(MemorySource):
    def load_player_seasons(self, before_season):
        return self.players


class MemoryRepository:
    def __init__(self):
        self.runs = []

    def persist(self, run):
        self.runs.append(run)


def player_history():
    position_values = {
        "QB": {
            "passing_attempts": 520,
            "passing_completions": 340,
            "passing_yards": 3900,
            "passing_touchdowns": 27,
            "interceptions": 11,
            "carries": 55,
            "rushing_yards": 280,
            "rushing_touchdowns": 3,
        },
        "RB": {
            "carries": 220,
            "rushing_yards": 980,
            "rushing_touchdowns": 8,
            "targets": 58,
            "receptions": 46,
            "receiving_yards": 360,
            "receiving_touchdowns": 2,
        },
        "WR": {
            "targets": 125,
            "receptions": 82,
            "receiving_yards": 1080,
            "receiving_touchdowns": 7,
            "carries": 6,
            "rushing_yards": 42,
            "rushing_touchdowns": 0,
        },
        "TE": {
            "targets": 92,
            "receptions": 65,
            "receiving_yards": 720,
            "receiving_touchdowns": 5,
        },
        "K": {
            "field_goals_made": 29,
            "field_goals_attempted": 34,
            "extra_points_made": 42,
            "extra_points_attempted": 43,
        },
        "DEF": {
            "defensive_sacks": 42,
            "defensive_interceptions": 14,
            "defensive_fumble_recoveries": 9,
            "defensive_touchdowns": 3,
        },
    }
    result = []
    for position_index, (position, base_values) in enumerate(position_values.items()):
        for player_number in range(2):
            for season in range(2022, 2026):
                factor = 1 + (season - 2022) * 0.04 + player_number * 0.08
                values = {name: round(value * factor, 4) for name, value in base_values.items()}
                values["games_played"] = 17 - ((season + player_number) % 2)
                result.append(
                    projection.PlayerSeason(
                        player_id=f"{position.lower()}-{player_number}",
                        player_name=f"Test {position} {player_number}",
                        position=position,
                        team_id=f"T{position_index}",
                        season=season,
                        values=values,
                    )
                )
    return result


def team_history():
    return [
        projection.TeamSeason(
            team_id=f"T{team}",
            season=season,
            values={
                "passing_attempts": 500 + team * 10,
                "carries": 430 + team * 5,
                "targets": 500 + team * 10,
            },
        )
        for team in range(6)
        for season in range(2022, 2026)
    ]


def request(scoring=SCORING, contexts=()):
    return projection.ProjectionRequest(
        target_season=2026,
        dataset_version_id="00000000-0000-0000-0000-000000000001",
        scoring=scoring,
        contexts=contexts,
        generated_at=datetime(2026, 7, 23, tzinfo=timezone.utc),
    )


def test_generates_valid_position_specific_versioned_outputs() -> None:
    source = MemorySource(player_history(), team_history())
    repository = MemoryRepository()

    run = projection.ProjectionService(source, repository).generate(request())

    assert source.requested_before == [2026]
    assert repository.runs == [run]
    assert {item.position for item in run.projections} == set(projection.SUPPORTED_POSITIONS)
    assert run.model_version == projection.MODEL_VERSION
    assert run.feature_version == projection.FEATURE_VERSION
    assert run.training_start_season == 2022
    assert run.training_end_season == 2025
    assert set(run.parameters_by_position) == set(projection.SUPPORTED_POSITIONS)
    for output in run.projections:
        assert output.season == 2026
        assert 0 <= output.floor <= output.median <= output.ceiling
        assert output.projected_fantasy_points == output.median
        assert output.projected_points_per_game == pytest.approx(
            output.median / output.projected_games, abs=0.0001
        )
        assert 0 <= output.confidence <= 1
        assert output.scoring_configuration_identifier == "test-ppr"
        assert "history_seasons" in output.features
        stats = output.projected_statistics
        if "passing_completions" in stats:
            assert stats["passing_completions"] <= stats["passing_attempts"]
        if "receptions" in stats:
            assert stats["receptions"] <= stats["targets"]
        if "field_goals_made" in stats:
            assert stats["field_goals_made"] <= stats["field_goals_attempted"]


def test_walk_forward_backtest_compares_simple_baselines_and_calibrates() -> None:
    run = projection.ProjectionService(MemorySource(player_history()), MemoryRepository()).generate(
        request()
    )

    assert set(run.backtest.model_comparison) == {
        "final_model",
        "previous_season_points",
        "previous_season_per_game",
        "multi_season_weighted_average",
        "positional_average",
    }
    assert run.backtest.model_comparison["final_model"].sample_size > 0
    assert run.backtest.model_comparison["final_model"].mean_absolute_error is not None
    assert set(run.backtest.model_comparison_by_position) == set(projection.SUPPORTED_POSITIONS)
    assert run.backtest.interval_sample_size > 0
    assert run.backtest.interval_coverage is not None
    assert 0 <= run.backtest.interval_coverage <= 1


def test_scoring_configuration_changes_points_without_retraining_statistics() -> None:
    standard = projection.ScoringConfiguration.from_mapping(
        {
            "identifier": "test-standard",
            "stat_points": {
                **SCORING.stat_points,
                "receptions": 0,
            },
        }
    )
    source = MemorySource(player_history())
    ppr_run = projection.ProjectionService(source, MemoryRepository()).generate(request())
    standard_run = projection.ProjectionService(source, MemoryRepository()).generate(
        request(scoring=standard)
    )
    ppr_wr = next(output for output in ppr_run.projections if output.player_id == "wr-0")
    standard_wr = next(output for output in standard_run.projections if output.player_id == "wr-0")

    assert ppr_wr.projected_statistics == standard_wr.projected_statistics
    assert ppr_wr.projected_fantasy_points > standard_wr.projected_fantasy_points
    assert standard_wr.scoring_configuration_identifier == "test-standard"


def test_context_applies_expected_role_and_injury_features_transparently() -> None:
    baseline = projection.ProjectionService(
        MemorySource(player_history()), MemoryRepository()
    ).generate(request())
    history = player_history()
    contextual = projection.ProjectionService(MemorySource(history), MemoryRepository()).generate(
        request(
            contexts=(
                projection.PlayerContext(
                    player_id="rb-0",
                    player_name="Test RB 0",
                    position="RB",
                    team_id="T1",
                    age=27,
                    experience=5,
                    expected_role=0.8,
                    injury_games_missed=4,
                    team_changed=True,
                    quarterback_changed=False,
                ),
            )
        )
    )
    baseline_rb = next(output for output in baseline.projections if output.player_id == "rb-0")
    contextual_rb = next(output for output in contextual.projections if output.player_id == "rb-0")

    assert contextual_rb.projected_fantasy_points < baseline_rb.projected_fantasy_points
    assert contextual_rb.features["age"] == 27
    assert contextual_rb.features["experience"] == 5
    assert contextual_rb.features["team_changed"] == 1
    assert contextual_rb.features["quarterback_changed"] == 0


def test_rejects_future_data_before_persisting() -> None:
    future_record = projection.PlayerSeason(
        player_id="future",
        player_name="Future Player",
        position="QB",
        team_id="FUT",
        season=2026,
        values={"passing_yards": 5000},
    )
    repository = MemoryRepository()

    with pytest.raises(ValueError, match="leak"):
        projection.ProjectionService(
            LeakySource([*player_history(), future_record]), repository
        ).generate(request())

    assert repository.runs == []


def test_json_repository_exports_validated_records_atomically(tmp_path: Path) -> None:
    output_path = tmp_path / "projection-run.json"
    run = projection.ProjectionService(
        MemorySource(player_history()),
        projection.JsonProjectionRepository(output_path),
    ).generate(request())

    exported = json.loads(output_path.read_text())
    assert exported["run_id"] == run.run_id
    assert exported["scoring_configuration_identifier"] == "test-ppr"
    assert exported["projections"][0]["model_version"] == projection.MODEL_VERSION
    assert exported["backtest"]["model_comparison"]["final_model"]["sample_size"] > 0


def test_postgres_repository_writes_run_and_outputs_in_one_connection(monkeypatch) -> None:
    generated = projection.ProjectionService(
        MemorySource(player_history()), MemoryRepository()
    ).generate(request())
    statements = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, statement, parameters):
            statements.append((statement, parameters))

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def cursor(self):
            return FakeCursor()

    fake_psycopg = SimpleNamespace(connect=lambda _: FakeConnection())
    monkeypatch.setattr(projection, "_load_psycopg", lambda: fake_psycopg)
    monkeypatch.setattr(projection, "_load_jsonb", lambda: lambda value: value)

    projection.PostgresProjectionRepository("postgresql://test").persist(generated)

    assert "INSERT INTO seasons" in statements[0][0]
    assert "INSERT INTO projection_runs" in statements[1][0]
    assert "ON CONFLICT (id) DO UPDATE" in statements[1][0]
    assert "DELETE FROM player_projections" in statements[2][0]
    output_inserts = [
        statement for statement, _ in statements if "INSERT INTO player_projections" in statement
    ]
    assert len(output_inserts) == len(generated.projections)


def test_scoring_and_private_visibility_require_explicit_configuration() -> None:
    with pytest.raises(ValueError, match="identifier"):
        projection.ScoringConfiguration.from_mapping(
            {"identifier": "", "stat_points": {"receptions": 1}}
        )
    with pytest.raises(ValueError, match="owner_user_id"):
        projection.ProjectionService(MemorySource(player_history()), MemoryRepository()).generate(
            projection.ProjectionRequest(
                target_season=2026,
                dataset_version_id="dataset",
                scoring=SCORING,
                visibility="private",
            )
        )
