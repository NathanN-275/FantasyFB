from __future__ import annotations

import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest


PIPELINE_DIRECTORY = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location("historical_ingestion", PIPELINE_DIRECTORY / "ingestion.py")
assert SPEC and SPEC.loader
ingestion = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ingestion
SPEC.loader.exec_module(ingestion)


class FixtureProvider:
    def __init__(self, rows):
        self.rows = rows

    def load_weekly_player_statistics(self, seasons):
        return self.rows


def fixture_rows():
    return json.loads((PIPELINE_DIRECTORY / "fixtures" / "weekly_player_stats.json").read_text())


def test_fixture_ingestion_generates_stable_ids_and_a_version(tmp_path: Path) -> None:
    first_state = tmp_path / "first.json"
    second_state = tmp_path / "second.json"
    now = datetime(2025, 9, 10, tzinfo=timezone.utc)

    first = ingestion.HistoricalIngestionService(
        FixtureProvider(fixture_rows()), ingestion.JsonHistoricalDataRepository(first_state)
    ).ingest([2025], now=now)[0]
    second = ingestion.HistoricalIngestionService(
        FixtureProvider(fixture_rows()), ingestion.JsonHistoricalDataRepository(second_state)
    ).ingest([2025], now=now)[0]

    assert first.status == "completed"
    assert first.dataset_version == second.dataset_version
    persisted = json.loads(first_state.read_text())
    dataset = persisted["datasets"]["nflverse:player-stats-weekly:2025"]
    assert dataset["metadata"]["license_or_usage_note"].startswith("CC-BY-4.0")
    assert dataset["records"][0]["player_canonical_id"]


def test_malformed_batch_is_quarantined_and_does_not_replace_last_valid_dataset(tmp_path: Path) -> None:
    state_file = tmp_path / "catalog.json"
    repository = ingestion.JsonHistoricalDataRepository(state_file)
    service = ingestion.HistoricalIngestionService(FixtureProvider(fixture_rows()), repository)
    successful = service.ingest([2025], now=datetime(2025, 9, 10, tzinfo=timezone.utc))[0]

    malformed = dict(fixture_rows()[0])
    malformed.pop("player_id")
    failed = ingestion.HistoricalIngestionService(
        FixtureProvider([fixture_rows()[0], malformed]), repository
    ).ingest([2025], now=datetime(2025, 9, 17, tzinfo=timezone.utc))[0]

    state = json.loads(state_file.read_text())
    last_valid = state["last_valid"]["nflverse:player-stats-weekly:2025"]
    assert failed.status == "quarantined"
    assert failed.unresolved_identity_count == 1
    assert last_valid["dataset_version"] == successful.dataset_version
    assert len(state["datasets"]) == 1


def test_display_name_alone_is_never_used_for_identity(tmp_path: Path) -> None:
    row = fixture_rows()[0]
    row.pop("player_id")
    report = ingestion.HistoricalIngestionService(
        FixtureProvider([row]), ingestion.JsonHistoricalDataRepository(tmp_path / "state.json")
    ).ingest([2025])[0]

    assert report.status == "failed"
    assert report.quarantine_reasons == {"missing-strong-player-identifier": 1}


def test_optional_nflverse_integration_smoke() -> None:
    if os.environ.get("RUN_NFLVERSE_SMOKE_TEST") != "1":
        pytest.skip("Set RUN_NFLVERSE_SMOKE_TEST=1 to call nflverse.")

    season = int(os.environ.get("NFLVERSE_SMOKE_SEASON", "2025"))
    records = ingestion.NflverseHistoricalDataProvider().load_weekly_player_statistics([season])

    assert records
    assert all(isinstance(record, dict) for record in records)
