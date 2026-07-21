"""Validated, versioned ingestion for the permitted nflverse player-stats dataset.

This module intentionally has no application imports.  Its repository protocol is
the boundary between an external provider and the application's persistence layer.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
import tempfile
from typing import Any, Callable, Dict, List, Mapping, Optional, Protocol, Sequence, Tuple, Union
from uuid import NAMESPACE_URL, uuid5


SOURCE_NAME = "nflverse"
SOURCE_IDENTIFIER = "player-stats-weekly"
SOURCE_URL = "https://github.com/nflverse/nflverse-data"
LICENSE_NOTE = (
    "CC-BY-4.0; attribute nflverse/nflverse-data. "
    "Only the player-stats dataset is enabled; FTN-derived data is excluded."
)
STRONG_PLAYER_ID_COLUMNS = ("gsis_id", "nfl_id", "player_id", "player_gsis_id", "pfr_id")
METADATA_COLUMNS = {
    "season",
    "week",
    "player_name",
    "player_display_name",
    "player_id",
    "player_gsis_id",
    "gsis_id",
    "nfl_id",
    "pfr_id",
    "position",
    "recent_team",
    "team",
    "opponent_team",
    "fantasy_points_ppr",
    "fantasy_points",
    "season_type",
}

# These are the application-owned names exposed by the historical-data module.
# Providers can omit any field, and provider-specific column names never leave
# this adapter. The aliases cover nflverse's current weekly player-stats schema
# plus common names used by replacement providers.
STAT_FIELD_ALIASES: Mapping[str, Tuple[str, ...]] = {
    "games_played": ("games", "games_played"),
    "games_started": ("games_started",),
    "passing_attempts": ("attempts", "passing_attempts", "pass_attempts"),
    "passing_completions": ("completions", "passing_completions", "pass_completions"),
    "passing_yards": ("passing_yards", "pass_yards"),
    "passing_touchdowns": ("passing_tds", "passing_touchdowns", "pass_touchdowns"),
    "interceptions": ("interceptions", "passing_interceptions", "pass_interceptions"),
    "carries": ("carries", "rushing_attempts"),
    "rushing_yards": ("rushing_yards",),
    "rushing_touchdowns": ("rushing_tds", "rushing_touchdowns"),
    "targets": ("targets",),
    "receptions": ("receptions",),
    "receiving_yards": ("receiving_yards",),
    "receiving_touchdowns": ("receiving_tds", "receiving_touchdowns"),
    "fumbles": ("fumbles",),
    "fumbles_lost": ("fumbles_lost",),
    "kick_returns": ("kick_returns",),
    "punt_returns": ("punt_returns",),
    "return_yards": ("return_yards", "kickoff_return_yards", "punt_return_yards"),
    "return_touchdowns": ("return_tds", "return_touchdowns"),
    "field_goals_made": ("field_goals_made", "field_goals"),
    "field_goals_attempted": ("field_goals_attempted", "field_goal_attempts"),
    "extra_points_made": ("extra_points_made",),
    "extra_points_attempted": ("extra_points_attempted",),
    "defensive_sacks": ("sacks", "defensive_sacks"),
    "defensive_interceptions": ("defensive_interceptions", "interceptions_defense"),
    "defensive_fumble_recoveries": ("defensive_fumble_recoveries", "fumble_recoveries"),
    "defensive_touchdowns": ("defensive_tds", "defensive_touchdowns"),
    "snap_share": ("snap_share", "offense_snap_pct"),
}
NON_ADDITIVE_FIELDS = {"snap_share"}


class HistoricalDataProvider(Protocol):
    """A provider must return mappings, never provider-specific frame objects."""

    def load_weekly_player_statistics(self, seasons: Sequence[int]) -> Sequence[Mapping[str, Any]]:
        ...


class HistoricalDataRepository(Protocol):
    """Atomic persistence boundary. A failed write must leave the previous valid data intact."""

    def store_success(
        self,
        dataset: "DatasetMetadata",
        records: Sequence["HistoricalStatistic"],
        quarantined: Sequence["QuarantinedRecord"],
        report: "IngestionReport",
    ) -> None:
        ...

    def store_failure(self, dataset: "DatasetMetadata", report: "IngestionReport") -> None:
        ...


@dataclass(frozen=True)
class DatasetMetadata:
    dataset_id: str
    source: str
    source_identifier: str
    source_url: str
    season: int
    retrieved_at: datetime
    effective_at: datetime
    dataset_version: str
    license_or_usage_note: str
    record_count: int
    validation_status: str
    freshness_status: str
    import_status: str
    error_status: Optional[str] = None
    last_known_successful_update: Optional[datetime] = None


@dataclass(frozen=True)
class HistoricalStatistic:
    canonical_id: str
    player_canonical_id: str
    player_external_id: str
    player_name: str
    position: Optional[str]
    team_abbreviation: str
    season: int
    week: int
    values: Mapping[str, float]


@dataclass(frozen=True)
class TeamHistoricalStatistic:
    canonical_id: str
    team_abbreviation: str
    season: int
    week: int
    values: Mapping[str, float]


@dataclass(frozen=True)
class QuarantinedRecord:
    source_row: int
    reason: str
    identifiers: Mapping[str, str]


@dataclass
class IngestionReport:
    source: str
    source_identifier: str
    season: int
    status: str
    started_at: datetime
    completed_at: datetime
    retrieved_record_count: int = 0
    accepted_record_count: int = 0
    quarantined_record_count: int = 0
    dataset_version: Optional[str] = None
    error_status: Optional[str] = None
    last_known_successful_update: Optional[datetime] = None
    unresolved_identity_count: int = 0
    ambiguous_identity_count: int = 0
    exact_identity_count: int = 0
    confident_identity_count: int = 0
    duplicate_record_count: int = 0
    quarantine_reasons: Dict[str, int] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=_json_default, sort_keys=True)


class NflverseHistoricalDataProvider:
    """nflreadpy adapter for the single reviewed, permitted initial dataset."""

    def __init__(self, loader: Optional[Callable[[Sequence[int]], Any]] = None) -> None:
        self._loader = loader

    def load_weekly_player_statistics(self, seasons: Sequence[int]) -> Sequence[Mapping[str, Any]]:
        if not seasons:
            raise ValueError("At least one season is required.")
        frame = self._loader(seasons) if self._loader else self._load_with_nflreadpy(seasons)
        if hasattr(frame, "to_dicts"):
            frame = frame.to_dicts()
        if not isinstance(frame, Sequence):
            raise TypeError("nflverse player statistics must be a sequence of record mappings.")
        if not all(isinstance(record, Mapping) for record in frame):
            raise TypeError("nflverse player statistics included a non-record value.")
        return list(frame)

    @staticmethod
    def _load_with_nflreadpy(seasons: Sequence[int]) -> Any:
        try:
            import nflreadpy as nfl  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError(
                "nflreadpy is required for live ingestion. Install pipelines/requirements.txt."
            ) from error
        return nfl.load_player_stats(list(seasons), summary_level="week")


class HistoricalIngestionService:
    """Runs all validation before one atomic repository write per season."""

    def __init__(self, provider: HistoricalDataProvider, repository: HistoricalDataRepository) -> None:
        self._provider = provider
        self._repository = repository

    def ingest(self, seasons: Sequence[int], now: Optional[datetime] = None) -> List[IngestionReport]:
        requested = _validate_seasons(seasons)
        retrieved_at = now or datetime.now(timezone.utc)
        started_at = retrieved_at
        try:
            rows = self._provider.load_weekly_player_statistics(requested)
        except Exception as error:  # provider exceptions become a health report, never a replacement
            return [self._provider_failure(season, started_at, error) for season in requested]

        reports: List[IngestionReport] = []
        for season in requested:
            season_rows = [row for row in rows if _integer(row.get("season")) == season]
            reports.append(self._ingest_season(season, season_rows, started_at, retrieved_at))
        return reports

    def _provider_failure(
        self, season: int, started_at: datetime, error: Exception
    ) -> IngestionReport:
        completed_at = datetime.now(timezone.utc)
        report = IngestionReport(
            source=SOURCE_NAME,
            source_identifier=SOURCE_IDENTIFIER,
            season=season,
            status="failed",
            started_at=started_at,
            completed_at=completed_at,
            error_status=_safe_error(error),
        )
        dataset = _failed_dataset(season, started_at, report.error_status or "provider failure")
        self._repository.store_failure(dataset, report)
        return report

    def _ingest_season(
        self,
        season: int,
        rows: Sequence[Mapping[str, Any]],
        started_at: datetime,
        retrieved_at: datetime,
    ) -> IngestionReport:
        accepted: List[HistoricalStatistic] = []
        quarantined: List[QuarantinedRecord] = []
        report = IngestionReport(
            source=SOURCE_NAME,
            source_identifier=SOURCE_IDENTIFIER,
            season=season,
            status="processing",
            started_at=started_at,
            completed_at=retrieved_at,
            retrieved_record_count=len(rows),
        )
        for index, row in enumerate(rows):
            result = _normalize_record(row, index, season)
            if isinstance(result, QuarantinedRecord):
                quarantined.append(result)
                report.quarantine_reasons[result.reason] = (
                    report.quarantine_reasons.get(result.reason, 0) + 1
                )
                if result.reason == "missing-strong-player-identifier":
                    report.unresolved_identity_count += 1
                if result.reason == "ambiguous-strong-player-identifiers":
                    report.ambiguous_identity_count += 1
            else:
                accepted.append(result)
                if _identity_confidence(row) == "exact":
                    report.exact_identity_count += 1
                else:
                    report.confident_identity_count += 1

        accepted, duplicate_records = _remove_duplicate_records(accepted)
        for duplicate in duplicate_records:
            quarantined.append(duplicate)
            report.quarantine_reasons[duplicate.reason] = (
                report.quarantine_reasons.get(duplicate.reason, 0) + 1
            )
        report.duplicate_record_count = len(duplicate_records)

        report.accepted_record_count = len(accepted)
        report.quarantined_record_count = len(quarantined)
        if not accepted:
            report.status = "failed"
            report.error_status = "no-valid-records"
            dataset = _failed_dataset(season, retrieved_at, report.error_status)
            self._repository.store_failure(dataset, report)
            return report

        # A batch with malformed records is quarantined as a whole. This prevents a
        # partially retrieved provider response from being presented as complete.
        if quarantined:
            report.status = "quarantined"
            report.error_status = "malformed-records-quarantined"
            dataset = _failed_dataset(season, retrieved_at, report.error_status)
            self._repository.store_failure(dataset, report)
            return report

        version = _dataset_version(accepted)
        report.dataset_version = version
        report.status = "completed"
        dataset = DatasetMetadata(
            dataset_id=f"{SOURCE_IDENTIFIER}:{season}",
            source=SOURCE_NAME,
            source_identifier=SOURCE_IDENTIFIER,
            source_url=SOURCE_URL,
            season=season,
            retrieved_at=retrieved_at,
            effective_at=retrieved_at,
            dataset_version=version,
            license_or_usage_note=LICENSE_NOTE,
            record_count=len(accepted),
            validation_status="valid",
            freshness_status="fresh",
            import_status="completed",
            last_known_successful_update=retrieved_at,
        )
        try:
            self._repository.store_success(dataset, accepted, quarantined, report)
        except Exception as error:
            report.status = "failed"
            report.error_status = _safe_error(error)
            self._repository.store_failure(_failed_dataset(season, retrieved_at, report.error_status), report)
        return report


class JsonHistoricalDataRepository:
    """Local, atomic repository for development and fixture runs.

    Production jobs use :class:`PostgresHistoricalDataRepository`; this adapter is
    intentionally explicit so local files never masquerade as production storage.
    """

    def __init__(self, path: Path) -> None:
        self._path = path

    def store_success(
        self,
        dataset: DatasetMetadata,
        records: Sequence[HistoricalStatistic],
        quarantined: Sequence[QuarantinedRecord],
        report: IngestionReport,
    ) -> None:
        state = self._read_state()
        key = _dataset_key(dataset)
        state["datasets"][key] = {
            "metadata": asdict(dataset),
            "weekly_player_statistics": [asdict(record) for record in records],
            "season_player_statistics": [
                asdict(record) for record in aggregate_player_season_statistics(records)
            ],
            "weekly_team_statistics": [
                asdict(record) for record in aggregate_team_weekly_statistics(records)
            ],
            "season_team_statistics": [
                asdict(record)
                for record in aggregate_team_season_statistics(aggregate_team_weekly_statistics(records))
            ],
            "quarantined": [asdict(record) for record in quarantined],
        }
        state["last_valid"][key] = asdict(dataset)
        state["runs"].append(asdict(report))
        self._write_state(state)

    def store_failure(self, dataset: DatasetMetadata, report: IngestionReport) -> None:
        state = self._read_state()
        state["runs"].append({"dataset": asdict(dataset), "report": asdict(report)})
        self._write_state(state)

    def _read_state(self) -> Dict[str, Any]:
        if not self._path.exists():
            return {"datasets": {}, "last_valid": {}, "runs": []}
        with self._path.open(encoding="utf-8") as handle:
            return json.load(handle)

    def _write_state(self, state: Mapping[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=self._path.parent, delete=False
        ) as handle:
            json.dump(state, handle, default=_json_default, sort_keys=True)
            temporary_path = Path(handle.name)
        temporary_path.replace(self._path)


class PostgresHistoricalDataRepository:
    """PostgreSQL adapter for the existing data-source, provenance, and stats tables."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def store_success(
        self,
        dataset: DatasetMetadata,
        records: Sequence[HistoricalStatistic],
        quarantined: Sequence[QuarantinedRecord],
        report: IngestionReport,
    ) -> None:
        if quarantined:
            raise ValueError("Quarantined records cannot be persisted as a complete dataset.")
        player_seasons = aggregate_player_season_statistics(records)
        team_weeks = aggregate_team_weekly_statistics(records)
        team_seasons = aggregate_team_season_statistics(team_weeks)
        try:
            import psycopg  # type: ignore[import-not-found]
            from psycopg.types.json import Jsonb  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError(
                "psycopg is required for PostgreSQL ingestion. Install pipelines/requirements.txt."
            ) from error

        with psycopg.connect(self._database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO data_sources (name, source_identifier, source_url, license_or_usage_note)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (name, source_identifier) DO UPDATE
                    SET source_url = EXCLUDED.source_url,
                        license_or_usage_note = EXCLUDED.license_or_usage_note,
                        updated_at = now()
                    RETURNING id
                    """,
                    (
                        dataset.source,
                        dataset.source_identifier,
                        dataset.source_url,
                        dataset.license_or_usage_note,
                    ),
                )
                source_id = cursor.fetchone()[0]
                dataset_id = str(uuid5(NAMESPACE_URL, f"{source_id}:{dataset.dataset_version}"))
                cursor.execute(
                    """
                    INSERT INTO dataset_versions
                        (id, data_source_id, visibility, version, season_year, retrieved_at, effective_at,
                         validation_status, freshness_status, record_count, license_or_usage_note)
                    VALUES (%s, %s, 'public', %s, %s, %s, %s, 'valid', 'valid', %s, %s)
                    ON CONFLICT (data_source_id, version) WHERE owner_user_id IS NULL DO UPDATE
                    SET retrieved_at = EXCLUDED.retrieved_at,
                        effective_at = EXCLUDED.effective_at,
                        validation_status = EXCLUDED.validation_status,
                        freshness_status = EXCLUDED.freshness_status,
                        record_count = EXCLUDED.record_count,
                        license_or_usage_note = EXCLUDED.license_or_usage_note
                    RETURNING id
                    """,
                    (
                        dataset_id,
                        source_id,
                        dataset.dataset_version,
                        dataset.season,
                        dataset.retrieved_at,
                        dataset.effective_at,
                        dataset.record_count,
                        dataset.license_or_usage_note,
                    ),
                )
                dataset_version_id = cursor.fetchone()[0]
                season_id = str(uuid5(NAMESPACE_URL, f"nfl-season:regular:{dataset.season}"))
                cursor.execute(
                    """
                    INSERT INTO seasons (id, year, kind) VALUES (%s, %s, 'regular')
                    ON CONFLICT (year, kind) DO UPDATE SET year = EXCLUDED.year
                    """,
                    (season_id, dataset.season),
                )
                for record in records:
                    team_id = str(uuid5(NAMESPACE_URL, f"nfl-team:{record.team_abbreviation}"))
                    cursor.execute(
                        """
                        INSERT INTO nfl_teams (id, name, abbreviation) VALUES (%s, %s, %s)
                        ON CONFLICT (abbreviation) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
                        """,
                        (team_id, record.team_abbreviation, record.team_abbreviation),
                    )
                    cursor.execute(
                        """
                        INSERT INTO players (id, full_name, position, team_id)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE SET
                            full_name = EXCLUDED.full_name, position = EXCLUDED.position,
                            team_id = EXCLUDED.team_id, updated_at = now()
                        """,
                        (record.player_canonical_id, record.player_name, record.position or "UNK", team_id),
                    )
                    cursor.execute(
                        """
                        INSERT INTO player_external_ids (player_id, provider, external_id)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (provider, external_id) DO UPDATE SET
                            player_id = EXCLUDED.player_id, updated_at = now()
                        """,
                        (record.player_canonical_id, SOURCE_NAME, record.player_external_id),
                    )
                    cursor.execute(
                        """
                        INSERT INTO weekly_statistics
                            (player_id, team_id, season_id, week, dataset_version_id, values)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (player_id, season_id, week, dataset_version_id) DO UPDATE
                        SET team_id = EXCLUDED.team_id, values = EXCLUDED.values
                        """,
                        (
                            record.player_canonical_id,
                            team_id,
                            season_id,
                            record.week,
                            dataset_version_id,
                            Jsonb(dict(record.values)),
                        ),
                    )
                for record in player_seasons:
                    team_id = str(uuid5(NAMESPACE_URL, f"nfl-team:{record.team_abbreviation}"))
                    cursor.execute(
                        """
                        INSERT INTO season_statistics
                            (player_id, team_id, season_id, dataset_version_id, values)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (player_id, team_id, season_id, dataset_version_id) DO UPDATE
                        SET values = EXCLUDED.values
                        """,
                        (
                            record.player_canonical_id,
                            team_id,
                            season_id,
                            dataset_version_id,
                            Jsonb(dict(record.values)),
                        ),
                    )
                for record in team_weeks:
                    team_id = str(uuid5(NAMESPACE_URL, f"nfl-team:{record.team_abbreviation}"))
                    cursor.execute(
                        """
                        INSERT INTO team_weekly_statistics
                            (team_id, season_id, week, dataset_version_id, values)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (team_id, season_id, week, dataset_version_id) DO UPDATE
                        SET values = EXCLUDED.values
                        """,
                        (team_id, season_id, record.week, dataset_version_id, Jsonb(dict(record.values))),
                    )
                for record in team_seasons:
                    team_id = str(uuid5(NAMESPACE_URL, f"nfl-team:{record.team_abbreviation}"))
                    cursor.execute(
                        """
                        INSERT INTO team_season_statistics
                            (team_id, season_id, dataset_version_id, values)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (team_id, season_id, dataset_version_id) DO UPDATE
                        SET values = EXCLUDED.values
                        """,
                        (team_id, season_id, dataset_version_id, Jsonb(dict(record.values))),
                    )

    def store_failure(self, dataset: DatasetMetadata, report: IngestionReport) -> None:
        # No mutation is intentional: the last valid dataset remains queryable.
        return None


def _normalize_record(
    row: Mapping[str, Any], source_row: int, expected_season: int
) -> Union[HistoricalStatistic, QuarantinedRecord]:
    identifiers = _strong_identifiers(row)
    if not identifiers:
        return _quarantine(source_row, "missing-strong-player-identifier", row)
    season = _integer(row.get("season"))
    week = _integer(row.get("week"))
    if season != expected_season or week is None or week < 1:
        return _quarantine(source_row, "invalid-season-or-week", row)
    if not _is_regular_season(row.get("season_type")):
        return _quarantine(source_row, "postseason-excluded", row)
    team = _string(row.get("recent_team")) or _string(row.get("team"))
    if not team:
        return _quarantine(source_row, "missing-team", row)
    name = _string(row.get("player_name")) or _string(row.get("player_display_name"))
    if not name:
        return _quarantine(source_row, "missing-player-name", row)
    # Identifier types have independent namespaces (for example GSIS and PFR IDs),
    # so different values are not ambiguous. Prefer the provider's most stable ID.
    external_id = next(identifiers[name] for name in STRONG_PLAYER_ID_COLUMNS if name in identifiers)
    values = _normalized_values(row)
    if not values:
        return _quarantine(source_row, "missing-numeric-statistics", row)
    player_canonical_id = str(uuid5(NAMESPACE_URL, f"{SOURCE_NAME}:player:{external_id}"))
    canonical_id = str(
        uuid5(NAMESPACE_URL, f"{SOURCE_IDENTIFIER}:{player_canonical_id}:{season}:{week}:{team}")
    )
    return HistoricalStatistic(
        canonical_id=canonical_id,
        player_canonical_id=player_canonical_id,
        player_external_id=external_id,
        player_name=name,
        position=_string(row.get("position")),
        team_abbreviation=team.upper(),
        season=season,
        week=week,
        values=values,
    )


def _strong_identifiers(row: Mapping[str, Any]) -> Dict[str, str]:
    return {
        name: value
        for name in STRONG_PLAYER_ID_COLUMNS
        if (value := _string(row.get(name))) is not None
    }


def _identity_confidence(row: Mapping[str, Any]) -> str:
    """Stable NFL/GSIS identifiers are exact; other reviewed provider IDs are confident."""
    return "exact" if any(_string(row.get(name)) for name in ("gsis_id", "nfl_id")) else "confident"


def _is_regular_season(value: Any) -> bool:
    if value is None:
        return True
    normalized = _string(value)
    return normalized is not None and normalized.upper() in {"REG", "REGULAR", "REGULAR_SEASON"}


def _normalized_values(row: Mapping[str, Any]) -> Dict[str, float]:
    """Return only canonical stat names and omit unavailable provider categories."""
    values: Dict[str, float] = {}
    for canonical_name, aliases in STAT_FIELD_ALIASES.items():
        for alias in aliases:
            value = row.get(alias)
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            numeric = float(value)
            if math.isfinite(numeric):
                values[canonical_name] = numeric
                break
    return values


def _remove_duplicate_records(
    records: Sequence[HistoricalStatistic],
) -> Tuple[List[HistoricalStatistic], List[QuarantinedRecord]]:
    """Keep a single stable record and report duplicate provider rows explicitly."""
    unique: List[HistoricalStatistic] = []
    duplicates: List[QuarantinedRecord] = []
    seen: set[str] = set()
    for source_row, record in enumerate(records):
        if record.canonical_id in seen:
            duplicates.append(
                QuarantinedRecord(
                    source_row=source_row,
                    reason="duplicate-record",
                    identifiers={"player_external_id": record.player_external_id},
                )
            )
            continue
        seen.add(record.canonical_id)
        unique.append(record)
    return unique, duplicates


def aggregate_player_season_statistics(
    records: Sequence[HistoricalStatistic],
) -> List[HistoricalStatistic]:
    """Aggregate a player separately for each team, preserving traded-player history."""
    grouped: Dict[Tuple[str, str, int, str], List[HistoricalStatistic]] = {}
    for record in records:
        key = (record.player_canonical_id, record.team_abbreviation, record.season, record.position or "")
        grouped.setdefault(key, []).append(record)
    result: List[HistoricalStatistic] = []
    for (_, team, season, _), weekly_records in sorted(grouped.items()):
        first = weekly_records[0]
        result.append(
            HistoricalStatistic(
                canonical_id=str(
                    uuid5(
                        NAMESPACE_URL,
                        f"{SOURCE_IDENTIFIER}:{first.player_canonical_id}:{season}:season:{team}",
                    )
                ),
                player_canonical_id=first.player_canonical_id,
                player_external_id=first.player_external_id,
                player_name=first.player_name,
                position=first.position,
                team_abbreviation=team,
                season=season,
                week=0,
                values=_aggregate_values([record.values for record in weekly_records]),
            )
        )
    return result


def aggregate_team_weekly_statistics(
    records: Sequence[HistoricalStatistic],
) -> List[TeamHistoricalStatistic]:
    grouped: Dict[Tuple[str, int, int], List[HistoricalStatistic]] = {}
    for record in records:
        grouped.setdefault((record.team_abbreviation, record.season, record.week), []).append(record)
    return [
        TeamHistoricalStatistic(
            canonical_id=str(uuid5(NAMESPACE_URL, f"{SOURCE_IDENTIFIER}:team:{team}:{season}:{week}")),
            team_abbreviation=team,
            season=season,
            week=week,
            values=_aggregate_values([record.values for record in team_records]),
        )
        for (team, season, week), team_records in sorted(grouped.items())
    ]


def aggregate_team_season_statistics(
    records: Sequence[TeamHistoricalStatistic],
) -> List[TeamHistoricalStatistic]:
    grouped: Dict[Tuple[str, int], List[TeamHistoricalStatistic]] = {}
    for record in records:
        grouped.setdefault((record.team_abbreviation, record.season), []).append(record)
    return [
        TeamHistoricalStatistic(
            canonical_id=str(uuid5(NAMESPACE_URL, f"{SOURCE_IDENTIFIER}:team:{team}:{season}:season")),
            team_abbreviation=team,
            season=season,
            week=0,
            values=_aggregate_values([record.values for record in weekly_records]),
        )
        for (team, season), weekly_records in sorted(grouped.items())
    ]


def _aggregate_values(values: Sequence[Mapping[str, float]]) -> Dict[str, float]:
    result: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    for value_map in values:
        for field, value in value_map.items():
            if field in NON_ADDITIVE_FIELDS:
                result[field] = result.get(field, 0.0) + value
                counts[field] = counts.get(field, 0) + 1
            else:
                result[field] = result.get(field, 0.0) + value
    for field, count in counts.items():
        result[field] /= count
    return result


def _quarantine(source_row: int, reason: str, row: Mapping[str, Any]) -> QuarantinedRecord:
    return QuarantinedRecord(source_row, reason, _strong_identifiers(row))


def _dataset_version(records: Sequence[HistoricalStatistic]) -> str:
    serializable = [asdict(record) for record in sorted(records, key=lambda record: record.canonical_id)]
    payload = json.dumps(serializable, sort_keys=True, separators=(",", ":"))
    return f"sha256:{sha256(payload.encode('utf-8')).hexdigest()}"


def _failed_dataset(season: int, retrieved_at: datetime, error: str) -> DatasetMetadata:
    return DatasetMetadata(
        dataset_id=f"{SOURCE_IDENTIFIER}:{season}",
        source=SOURCE_NAME,
        source_identifier=SOURCE_IDENTIFIER,
        source_url=SOURCE_URL,
        season=season,
        retrieved_at=retrieved_at,
        effective_at=retrieved_at,
        dataset_version="unavailable",
        license_or_usage_note=LICENSE_NOTE,
        record_count=0,
        validation_status="invalid",
        freshness_status="unknown",
        import_status="failed",
        error_status=error,
    )


def _dataset_key(dataset: DatasetMetadata) -> str:
    return f"{dataset.source}:{dataset.source_identifier}:{dataset.season}"


def _validate_seasons(seasons: Sequence[int]) -> Tuple[int, ...]:
    normalized = tuple(sorted(set(seasons)))
    if not normalized or any(not isinstance(year, int) or year < 1920 or year > 2100 for year in normalized):
        raise ValueError("Seasons must be unique NFL years between 1920 and 2100.")
    return normalized


def _integer(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _string(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _safe_error(error: Exception) -> str:
    return f"{type(error).__name__}: {str(error)[:240]}"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"{type(value).__name__} is not JSON serializable")
