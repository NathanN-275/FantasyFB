"""Transparent, leakage-safe season projection pipeline.

The module uses only Python's standard library for modeling. Its interpretable
model is a position/stat-specific blend of recent volume, a multi-season weighted
average, and regression toward the position average. Blend parameters are selected
with walk-forward mean absolute error.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
import statistics
import tempfile
from typing import Any, Dict, Iterable, List, Mapping, Optional, Protocol, Sequence, Tuple
from uuid import NAMESPACE_URL, uuid5


MODEL_VERSION = "transparent-baseline-v1.0.0"
FEATURE_VERSION = "position-features-v1.0.0"
SUPPORTED_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
NON_ADDITIVE_STATS = {"snap_share"}
GAMES_STAT = "games_played"
MAX_REGULAR_SEASON_GAMES = 17.0

POSITION_STATS: Mapping[str, Tuple[str, ...]] = {
    "QB": (
        "passing_attempts",
        "passing_completions",
        "passing_yards",
        "passing_touchdowns",
        "interceptions",
        "carries",
        "rushing_yards",
        "rushing_touchdowns",
    ),
    "RB": (
        "carries",
        "rushing_yards",
        "rushing_touchdowns",
        "targets",
        "receptions",
        "receiving_yards",
        "receiving_touchdowns",
    ),
    "WR": (
        "targets",
        "receptions",
        "receiving_yards",
        "receiving_touchdowns",
        "carries",
        "rushing_yards",
        "rushing_touchdowns",
    ),
    "TE": (
        "targets",
        "receptions",
        "receiving_yards",
        "receiving_touchdowns",
    ),
    "K": (
        "field_goals_made",
        "field_goals_attempted",
        "extra_points_made",
        "extra_points_attempted",
    ),
    "DEF": (
        "defensive_sacks",
        "defensive_interceptions",
        "defensive_fumble_recoveries",
        "defensive_touchdowns",
    ),
}

VOLUME_STATS = {
    "passing_attempts",
    "carries",
    "targets",
    "field_goals_attempted",
    "extra_points_attempted",
    "defensive_sacks",
}

PARAMETER_CANDIDATES: Tuple[Tuple[float, float], ...] = (
    (0.60, 0.10),
    (0.75, 0.10),
    (0.75, 0.20),
    (0.90, 0.10),
)


class ProjectionDataSource(Protocol):
    """Normalized input boundary. Provider response shapes never enter the model."""

    def load_player_seasons(self, before_season: int) -> Sequence["PlayerSeason"]: ...

    def load_team_seasons(self, before_season: int) -> Sequence["TeamSeason"]: ...


class ProjectionRepository(Protocol):
    """Atomic output boundary for a validated projection run."""

    def persist(self, run: "ProjectionRun") -> None: ...


@dataclass(frozen=True)
class PlayerSeason:
    player_id: str
    player_name: str
    position: str
    team_id: str
    season: int
    values: Mapping[str, float]


@dataclass(frozen=True)
class TeamSeason:
    team_id: str
    season: int
    values: Mapping[str, float]


@dataclass(frozen=True)
class PlayerContext:
    player_id: str
    player_name: str
    position: str
    team_id: str
    age: Optional[float] = None
    experience: Optional[float] = None
    expected_role: Optional[float] = None
    injury_games_missed: Optional[float] = None
    team_changed: Optional[bool] = None
    quarterback_changed: Optional[bool] = None


@dataclass(frozen=True)
class ScoringConfiguration:
    identifier: str
    stat_points: Mapping[str, float]

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "ScoringConfiguration":
        identifier = value.get("identifier")
        stat_points = value.get("stat_points")
        if not isinstance(identifier, str) or not identifier.strip():
            raise ValueError("Scoring configuration requires a non-empty identifier.")
        if not isinstance(stat_points, Mapping) or not stat_points:
            raise ValueError("Scoring configuration requires non-empty stat_points.")
        parsed: Dict[str, float] = {}
        for name, rate in stat_points.items():
            if not isinstance(name, str) or not name:
                raise ValueError("Scoring statistic names must be non-empty strings.")
            parsed[name] = _finite_number(rate, f"stat_points.{name}")
        return cls(identifier=identifier, stat_points=parsed)


@dataclass(frozen=True)
class ProjectionRequest:
    target_season: int
    dataset_version_id: str
    scoring: ScoringConfiguration
    contexts: Sequence[PlayerContext] = ()
    visibility: str = "public"
    owner_user_id: Optional[str] = None
    generated_at: Optional[datetime] = None


@dataclass(frozen=True)
class ModelParameters:
    recent_weight: float
    position_shrinkage: float


@dataclass(frozen=True)
class ProjectionOutput:
    player_id: str
    player_name: str
    position: str
    team_id: str
    season: int
    projected_games: float
    projected_statistics: Mapping[str, float]
    projected_fantasy_points: float
    projected_points_per_game: float
    floor: float
    median: float
    ceiling: float
    confidence: float
    model_version: str
    feature_version: str
    generated_at: datetime
    scoring_configuration_identifier: str
    features: Mapping[str, float]


@dataclass(frozen=True)
class Metric:
    sample_size: int
    mean_absolute_error: Optional[float]
    root_mean_squared_error: Optional[float]


@dataclass(frozen=True)
class BacktestReport:
    training_start_season: int
    training_end_season: int
    model_comparison: Mapping[str, Metric]
    model_comparison_by_position: Mapping[str, Mapping[str, Metric]]
    interval_sample_size: int
    interval_coverage: Optional[float]
    mean_interval_width: Optional[float]
    residuals_by_position: Mapping[str, Tuple[float, ...]]


@dataclass(frozen=True)
class ProjectionRun:
    run_id: str
    dataset_version_id: str
    target_season: int
    visibility: str
    owner_user_id: Optional[str]
    model_version: str
    feature_version: str
    scoring_configuration_identifier: str
    training_start_season: int
    training_end_season: int
    generated_at: datetime
    parameters_by_position: Mapping[str, ModelParameters]
    backtest: BacktestReport
    projections: Sequence[ProjectionOutput]

    def to_mapping(self) -> Mapping[str, Any]:
        return _serialize(asdict(self))


class JsonHistoricalProjectionDataSource:
    """Reads normalized JSON emitted by JsonHistoricalDataRepository."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def load_player_seasons(self, before_season: int) -> Sequence[PlayerSeason]:
        state = self._read()
        result: List[PlayerSeason] = []
        for dataset in state.get("datasets", {}).values():
            for record in dataset.get("season_player_statistics", []):
                season = record.get("season")
                if not isinstance(season, int) or season >= before_season:
                    continue
                values = _numeric_mapping(record.get("values"), "player season values")
                result.append(
                    PlayerSeason(
                        player_id=_required_string(record.get("player_canonical_id"), "player_id"),
                        player_name=_required_string(record.get("player_name"), "player_name"),
                        position=_required_string(record.get("position"), "position").upper(),
                        team_id=_required_string(
                            record.get("team_abbreviation"), "team_abbreviation"
                        ),
                        season=season,
                        values=values,
                    )
                )
        return _merge_player_team_seasons(result)

    def load_team_seasons(self, before_season: int) -> Sequence[TeamSeason]:
        state = self._read()
        result: List[TeamSeason] = []
        for dataset in state.get("datasets", {}).values():
            for record in dataset.get("season_team_statistics", []):
                season = record.get("season")
                if not isinstance(season, int) or season >= before_season:
                    continue
                result.append(
                    TeamSeason(
                        team_id=_required_string(
                            record.get("team_abbreviation"), "team_abbreviation"
                        ),
                        season=season,
                        values=_numeric_mapping(record.get("values"), "team season values"),
                    )
                )
        return result

    def _read(self) -> Mapping[str, Any]:
        with self._path.open(encoding="utf-8") as handle:
            value = json.load(handle)
        if not isinstance(value, Mapping):
            raise ValueError("Historical projection input must be a JSON object.")
        return value


class JsonProjectionRepository:
    """Development output adapter with an atomic replace."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def persist(self, run: ProjectionRun) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=self._path.parent, delete=False
        ) as handle:
            json.dump(run.to_mapping(), handle, indent=2, sort_keys=True)
            handle.write("\n")
            temporary_path = Path(handle.name)
        temporary_path.replace(self._path)


class PostgresProjectionDataSource:
    """Loads application-normalized player and team season rows from PostgreSQL."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def load_player_seasons(self, before_season: int) -> Sequence[PlayerSeason]:
        psycopg = _load_psycopg()
        with psycopg.connect(self._database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH latest_versions AS (
                        SELECT DISTINCT ON (season_year) id
                        FROM dataset_versions
                        WHERE validation_status = 'valid' AND season_year < %s
                        ORDER BY season_year, retrieved_at DESC, id DESC
                    )
                    SELECT ss.player_id::text, p.full_name, p.position,
                           nt.abbreviation, s.year, ss.values
                    FROM season_statistics ss
                    JOIN players p ON p.id = ss.player_id
                    JOIN nfl_teams nt ON nt.id = ss.team_id
                    JOIN seasons s ON s.id = ss.season_id
                    JOIN dataset_versions dv ON dv.id = ss.dataset_version_id
                    JOIN latest_versions lv ON lv.id = dv.id
                    WHERE s.kind = 'regular' AND s.year < %s
                    ORDER BY s.year, ss.player_id
                    """,
                    (before_season, before_season),
                )
                records = [
                    PlayerSeason(
                        player_id=row[0],
                        player_name=row[1],
                        position=row[2],
                        team_id=row[3],
                        season=row[4],
                        values=_numeric_mapping(row[5], "player season values"),
                    )
                    for row in cursor.fetchall()
                ]
        return _merge_player_team_seasons(records)

    def load_team_seasons(self, before_season: int) -> Sequence[TeamSeason]:
        psycopg = _load_psycopg()
        with psycopg.connect(self._database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH latest_versions AS (
                        SELECT DISTINCT ON (season_year) id
                        FROM dataset_versions
                        WHERE validation_status = 'valid' AND season_year < %s
                        ORDER BY season_year, retrieved_at DESC, id DESC
                    )
                    SELECT nt.abbreviation, s.year, tss.values
                    FROM team_season_statistics tss
                    JOIN nfl_teams nt ON nt.id = tss.team_id
                    JOIN seasons s ON s.id = tss.season_id
                    JOIN dataset_versions dv ON dv.id = tss.dataset_version_id
                    JOIN latest_versions lv ON lv.id = dv.id
                    WHERE s.kind = 'regular' AND s.year < %s
                    ORDER BY s.year, nt.abbreviation
                    """,
                    (before_season, before_season),
                )
                return [
                    TeamSeason(
                        team_id=row[0],
                        season=row[1],
                        values=_numeric_mapping(row[2], "team season values"),
                    )
                    for row in cursor.fetchall()
                ]


class PostgresProjectionRepository:
    """Persists one complete projection run in a PostgreSQL transaction."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def persist(self, run: ProjectionRun) -> None:
        psycopg = _load_psycopg()
        Jsonb = _load_jsonb()

        season_id = str(uuid5(NAMESPACE_URL, f"nfl-season:regular:{run.target_season}"))
        metrics = _serialize(asdict(run.backtest))
        with psycopg.connect(self._database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO seasons (id, year, kind) VALUES (%s, %s, 'regular')
                    ON CONFLICT (year, kind) DO UPDATE SET year = EXCLUDED.year
                    """,
                    (season_id, run.target_season),
                )
                cursor.execute(
                    """
                    INSERT INTO projection_runs
                        (id, dataset_version_id, owner_user_id, visibility, season_id,
                         projection_kind, model_version, feature_version,
                         scoring_configuration_identifier, training_start_season,
                         training_end_season, metrics, generated_at)
                    VALUES (%s, %s, %s, %s, %s, 'model', %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        dataset_version_id = EXCLUDED.dataset_version_id,
                        owner_user_id = EXCLUDED.owner_user_id,
                        visibility = EXCLUDED.visibility,
                        season_id = EXCLUDED.season_id,
                        model_version = EXCLUDED.model_version,
                        feature_version = EXCLUDED.feature_version,
                        scoring_configuration_identifier =
                            EXCLUDED.scoring_configuration_identifier,
                        training_start_season = EXCLUDED.training_start_season,
                        training_end_season = EXCLUDED.training_end_season,
                        metrics = EXCLUDED.metrics,
                        generated_at = EXCLUDED.generated_at
                    """,
                    (
                        run.run_id,
                        run.dataset_version_id,
                        run.owner_user_id,
                        run.visibility,
                        season_id,
                        run.model_version,
                        run.feature_version,
                        run.scoring_configuration_identifier,
                        run.training_start_season,
                        run.training_end_season,
                        Jsonb(metrics),
                        run.generated_at,
                    ),
                )
                cursor.execute(
                    "DELETE FROM player_projections WHERE projection_run_id = %s",
                    (run.run_id,),
                )
                for output in run.projections:
                    cursor.execute(
                        """
                        INSERT INTO player_projections
                            (projection_run_id, player_id, projected_games, projected_stats,
                             projected_points, projected_points_per_game, floor_points,
                             median_points, ceiling_points, confidence)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            run.run_id,
                            output.player_id,
                            output.projected_games,
                            Jsonb(dict(output.projected_statistics)),
                            output.projected_fantasy_points,
                            output.projected_points_per_game,
                            output.floor,
                            output.median,
                            output.ceiling,
                            output.confidence,
                        ),
                    )


class ProjectionService:
    """Narrow application-facing orchestration for a reproducible model run."""

    def __init__(self, source: ProjectionDataSource, repository: ProjectionRepository) -> None:
        self._source = source
        self._repository = repository

    def generate(self, request: ProjectionRequest) -> ProjectionRun:
        _validate_request(request)
        player_seasons = list(self._source.load_player_seasons(request.target_season))
        team_seasons = list(self._source.load_team_seasons(request.target_season))
        if not player_seasons:
            raise ValueError("At least one normalized historical player season is required.")
        if any(record.season >= request.target_season for record in player_seasons):
            raise ValueError("Future or target-season player data would leak into training.")
        if any(record.season >= request.target_season for record in team_seasons):
            raise ValueError("Future or target-season team data would leak into training.")

        seasons = sorted({record.season for record in player_seasons})
        parameters = _train_parameters(player_seasons)
        backtest = _backtest(player_seasons, request.scoring)
        generated_at = request.generated_at or datetime.now(timezone.utc)
        contexts = _resolve_contexts(player_seasons, request.contexts, request.target_season)
        team_factors = _team_volume_factors(team_seasons)
        residuals = backtest.residuals_by_position
        projections = [
            _project_player(
                context=context,
                history=_history_for_player(player_seasons, context.player_id),
                all_history=player_seasons,
                parameters=parameters[context.position],
                scoring=request.scoring,
                target_season=request.target_season,
                generated_at=generated_at,
                residuals=residuals.get(context.position, ()),
                team_volume_factor=team_factors.get(context.team_id, 1.0),
            )
            for context in contexts
            if context.position in SUPPORTED_POSITIONS
        ]
        projections.sort(key=lambda item: (-item.projected_fantasy_points, item.player_id))
        payload_hash = sha256(
            json.dumps(
                {
                    "dataset": request.dataset_version_id,
                    "target": request.target_season,
                    "model": MODEL_VERSION,
                    "features": FEATURE_VERSION,
                    "scoring": request.scoring.identifier,
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        run = ProjectionRun(
            run_id=str(uuid5(NAMESPACE_URL, f"fantasyfb:projection:{payload_hash}")),
            dataset_version_id=request.dataset_version_id,
            target_season=request.target_season,
            visibility=request.visibility,
            owner_user_id=request.owner_user_id,
            model_version=MODEL_VERSION,
            feature_version=FEATURE_VERSION,
            scoring_configuration_identifier=request.scoring.identifier,
            training_start_season=seasons[0],
            training_end_season=seasons[-1],
            generated_at=generated_at,
            parameters_by_position=parameters,
            backtest=backtest,
            projections=projections,
        )
        validate_projection_run(run)
        self._repository.persist(run)
        return run


def validate_projection_run(run: ProjectionRun) -> None:
    """Reject incomplete, non-finite, or internally inconsistent exports."""
    if not run.projections:
        raise ValueError("A projection run must contain at least one projection.")
    if run.training_end_season >= run.target_season:
        raise ValueError("Training range must end before the projected season.")
    for output in run.projections:
        if output.season != run.target_season:
            raise ValueError("Every projection season must match the run target.")
        if output.model_version != run.model_version:
            raise ValueError("Projection model version does not match its run.")
        if output.feature_version != run.feature_version:
            raise ValueError("Projection feature version does not match its run.")
        if output.scoring_configuration_identifier != run.scoring_configuration_identifier:
            raise ValueError("Projection scoring configuration does not match its run.")
        values = (
            output.projected_games,
            output.projected_fantasy_points,
            output.projected_points_per_game,
            output.floor,
            output.median,
            output.ceiling,
            output.confidence,
            *output.projected_statistics.values(),
            *output.features.values(),
        )
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"Projection for {output.player_id} contains a non-finite value.")
        if not 0 <= output.projected_games <= MAX_REGULAR_SEASON_GAMES:
            raise ValueError(f"Projection for {output.player_id} has invalid projected games.")
        if not 0 <= output.floor <= output.median <= output.ceiling:
            raise ValueError(f"Projection for {output.player_id} has invalid uncertainty bounds.")
        if not 0 <= output.confidence <= 1:
            raise ValueError(f"Projection for {output.player_id} has invalid confidence.")


def _train_parameters(records: Sequence[PlayerSeason]) -> Mapping[str, ModelParameters]:
    result: Dict[str, ModelParameters] = {}
    for position in SUPPORTED_POSITIONS:
        position_records = [record for record in records if record.position == position]
        best_parameters = ModelParameters(*PARAMETER_CANDIDATES[0])
        best_error = math.inf
        for recent_weight, shrinkage in PARAMETER_CANDIDATES:
            parameters = ModelParameters(recent_weight, shrinkage)
            errors: List[float] = []
            for target in _walk_forward_targets(position_records):
                history = [
                    record
                    for record in position_records
                    if record.player_id == target.player_id and record.season < target.season
                ]
                if not history:
                    continue
                for stat in POSITION_STATS[position]:
                    if stat not in target.values:
                        continue
                    prediction = _predict_stat(
                        history,
                        stat,
                        parameters,
                        _position_stat_mean(position_records, position, stat, target.season),
                    )
                    errors.append(abs(prediction - target.values[stat]))
            error = statistics.fmean(errors) if errors else math.inf
            if error < best_error:
                best_error = error
                best_parameters = parameters
        result[position] = best_parameters
    return result


def _backtest(
    records: Sequence[PlayerSeason],
    scoring: ScoringConfiguration,
) -> BacktestReport:
    observations: Dict[str, List[Tuple[float, float]]] = {
        "final_model": [],
        "previous_season_points": [],
        "previous_season_per_game": [],
        "multi_season_weighted_average": [],
        "positional_average": [],
    }
    by_position: Dict[str, Dict[str, List[Tuple[float, float]]]] = {}
    residuals_by_position: Dict[str, List[float]] = {}
    interval_rows: List[Tuple[float, float]] = []

    target_seasons = sorted({target.season for target in _walk_forward_targets(records)})
    for target_season in target_seasons:
        prior_records = [record for record in records if record.season < target_season]
        parameters_by_position = _train_parameters(prior_records)
        season_residuals: Dict[str, List[float]] = {}
        targets = [
            target for target in _walk_forward_targets(records) if target.season == target_season
        ]
        for target in targets:
            history = _history_for_player(records, target.player_id, before_season=target.season)
            if not history or target.position not in SUPPORTED_POSITIONS:
                continue
            position = target.position
            stats = POSITION_STATS[position]
            prior_pool = [record for record in prior_records if record.position == position]
            parameters = parameters_by_position[position]
            predicted_stats = {
                stat: _predict_stat(
                    history,
                    stat,
                    parameters,
                    _position_stat_mean(prior_pool, position, stat, target.season),
                )
                for stat in stats
            }
            _enforce_stat_constraints(predicted_stats)
            weighted_stats = {
                stat: _weighted_average(
                    [(record.season, record.values.get(stat, 0.0)) for record in history]
                )
                for stat in stats
            }
            position_stats = {
                stat: _position_stat_mean(prior_pool, position, stat, target.season)
                for stat in stats
            }
            actual = _score(target.values, scoring)
            recent = history[-1]
            recent_points = _score(recent.values, scoring)
            recent_games = max(recent.values.get(GAMES_STAT, MAX_REGULAR_SEASON_GAMES), 1.0)
            projected_games = _project_games(history)
            predictions = {
                "final_model": _score(predicted_stats, scoring),
                "previous_season_points": recent_points,
                "previous_season_per_game": recent_points / recent_games * projected_games,
                "multi_season_weighted_average": _score(weighted_stats, scoring),
                "positional_average": _score(position_stats, scoring),
            }
            position_observations = by_position.setdefault(
                position, {name: [] for name in observations}
            )
            for name, predicted in predictions.items():
                observations[name].append((predicted, actual))
                position_observations[name].append((predicted, actual))
            residual = actual - predictions["final_model"]
            prior_residuals = residuals_by_position.setdefault(position, [])
            if prior_residuals:
                radius = _quantile([abs(value) for value in prior_residuals], 0.80)
                interval_rows.append((1.0 if abs(residual) <= radius else 0.0, radius * 2))
            season_residuals.setdefault(position, []).append(residual)
        for position, values in season_residuals.items():
            residuals_by_position.setdefault(position, []).extend(values)

    seasons = sorted({record.season for record in records})
    return BacktestReport(
        training_start_season=seasons[0],
        training_end_season=seasons[-1],
        model_comparison={name: _metrics(pairs) for name, pairs in observations.items()},
        model_comparison_by_position={
            position: {name: _metrics(pairs) for name, pairs in models.items()}
            for position, models in by_position.items()
        },
        interval_sample_size=len(interval_rows),
        interval_coverage=(
            statistics.fmean(row[0] for row in interval_rows) if interval_rows else None
        ),
        mean_interval_width=(
            statistics.fmean(row[1] for row in interval_rows) if interval_rows else None
        ),
        residuals_by_position={
            position: tuple(values) for position, values in residuals_by_position.items()
        },
    )


def _project_player(
    context: PlayerContext,
    history: Sequence[PlayerSeason],
    all_history: Sequence[PlayerSeason],
    parameters: ModelParameters,
    scoring: ScoringConfiguration,
    target_season: int,
    generated_at: datetime,
    residuals: Sequence[float],
    team_volume_factor: float,
) -> ProjectionOutput:
    stats = POSITION_STATS[context.position]
    projected_games = _project_games(history)
    role_factor = _bounded(context.expected_role or 1.0, 0.5, 1.5)
    injury_factor = 1.0
    if context.injury_games_missed is not None:
        injury_factor = _bounded(1.0 - context.injury_games_missed * 0.015, 0.75, 1.0)
    availability_factor = role_factor * injury_factor
    projected_statistics: Dict[str, float] = {}
    features: Dict[str, float] = {
        "projected_games": projected_games,
        "expected_role_factor": role_factor,
        "injury_availability_factor": injury_factor,
        "team_offensive_volume_factor": team_volume_factor,
        "history_seasons": float(len(history)),
    }
    if context.age is not None:
        features["age"] = context.age
    if context.experience is not None:
        features["experience"] = context.experience
    if context.team_changed is not None:
        features["team_changed"] = 1.0 if context.team_changed else 0.0
    if context.quarterback_changed is not None:
        features["quarterback_changed"] = 1.0 if context.quarterback_changed else 0.0

    for stat in stats:
        recent = history[-1].values.get(stat, 0.0) if history else 0.0
        weighted = _weighted_average(
            [(record.season, record.values.get(stat, 0.0)) for record in history]
        )
        position_mean = _position_stat_mean(all_history, context.position, stat, target_season)
        raw = _predict_stat(history, stat, parameters, position_mean)
        volume_factor = team_volume_factor if stat in VOLUME_STATS else 1.0
        projected = raw * availability_factor * volume_factor
        projected_statistics[stat] = round(max(0.0, projected), 4)
        features[f"recent_{stat}"] = recent
        features[f"weighted_{stat}"] = weighted
        features[f"position_average_{stat}"] = position_mean

    _enforce_stat_constraints(projected_statistics)
    median = max(0.0, _score(projected_statistics, scoring))
    error_radius = (
        _quantile([abs(value) for value in residuals], 0.80) if residuals else median * 0.35
    )
    floor = max(0.0, median - error_radius)
    ceiling = median + error_radius
    dispersion = error_radius / max(median, 1.0)
    confidence = _bounded(
        0.40 + min(len(history), 3) * 0.12 + (1 - min(dispersion, 1)) * 0.20, 0, 0.95
    )
    points_per_game = median / projected_games if projected_games > 0 else 0.0
    return ProjectionOutput(
        player_id=context.player_id,
        player_name=context.player_name,
        position=context.position,
        team_id=context.team_id,
        season=target_season,
        projected_games=round(projected_games, 4),
        projected_statistics=projected_statistics,
        projected_fantasy_points=round(median, 4),
        projected_points_per_game=round(points_per_game, 4),
        floor=round(floor, 4),
        median=round(median, 4),
        ceiling=round(ceiling, 4),
        confidence=round(confidence, 4),
        model_version=MODEL_VERSION,
        feature_version=FEATURE_VERSION,
        generated_at=generated_at,
        scoring_configuration_identifier=scoring.identifier,
        features={name: round(value, 4) for name, value in features.items()},
    )


def _resolve_contexts(
    records: Sequence[PlayerSeason],
    supplied: Sequence[PlayerContext],
    target_season: int,
) -> Sequence[PlayerContext]:
    contexts = {context.player_id: context for context in supplied}
    latest_by_player: Dict[str, PlayerSeason] = {}
    for record in sorted(records, key=lambda item: (item.season, item.player_id)):
        latest_by_player[record.player_id] = record
    for player_id, record in latest_by_player.items():
        if record.season < target_season - 2 or player_id in contexts:
            continue
        contexts[player_id] = PlayerContext(
            player_id=record.player_id,
            player_name=record.player_name,
            position=record.position,
            team_id=record.team_id,
        )
    return sorted(contexts.values(), key=lambda context: context.player_id)


def _team_volume_factors(records: Sequence[TeamSeason]) -> Mapping[str, float]:
    if not records:
        return {}
    latest_season = max(record.season for record in records)
    latest = [record for record in records if record.season == latest_season]
    volumes = {
        record.team_id: sum(record.values.get(stat, 0.0) for stat in VOLUME_STATS)
        for record in latest
    }
    positive = [value for value in volumes.values() if value > 0]
    if not positive:
        return {}
    median = statistics.median(positive)
    return {
        team: _bounded(1.0 + 0.10 * (volume / median - 1.0), 0.90, 1.10)
        for team, volume in volumes.items()
        if volume > 0
    }


def _predict_stat(
    history: Sequence[PlayerSeason],
    stat: str,
    parameters: ModelParameters,
    position_mean: float,
) -> float:
    if not history:
        return max(0.0, position_mean)
    ordered = sorted(history, key=lambda record: record.season)
    recent = ordered[-1].values.get(stat, 0.0)
    weighted = _weighted_average(
        [(record.season, record.values.get(stat, 0.0)) for record in ordered]
    )
    player_blend = parameters.recent_weight * recent + (1 - parameters.recent_weight) * weighted
    prediction = (
        1 - parameters.position_shrinkage
    ) * player_blend + parameters.position_shrinkage * position_mean
    return max(0.0, prediction)


def _position_stat_mean(
    records: Sequence[PlayerSeason],
    position: str,
    stat: str,
    before_season: int,
) -> float:
    eligible = [
        record
        for record in records
        if record.position == position and record.season < before_season
    ]
    if not eligible:
        return 0.0
    latest_season = max(record.season for record in eligible)
    values = [
        record.values[stat]
        for record in eligible
        if record.season == latest_season and stat in record.values
    ]
    return statistics.fmean(values) if values else 0.0


def _project_games(history: Sequence[PlayerSeason]) -> float:
    if not history:
        return MAX_REGULAR_SEASON_GAMES
    values = [
        (record.season, _bounded(record.values.get(GAMES_STAT, MAX_REGULAR_SEASON_GAMES), 0, 17))
        for record in history
    ]
    return _bounded(_weighted_average(values), 0, MAX_REGULAR_SEASON_GAMES)


def _weighted_average(values: Sequence[Tuple[int, float]]) -> float:
    ordered = sorted(values, reverse=True)[:3]
    if not ordered:
        return 0.0
    weights = (0.60, 0.30, 0.10)
    applied = weights[: len(ordered)]
    denominator = sum(applied)
    return sum(value * weight for (_, value), weight in zip(ordered, applied)) / denominator


def _score(values: Mapping[str, float], scoring: ScoringConfiguration) -> float:
    return sum(values.get(stat, 0.0) * rate for stat, rate in scoring.stat_points.items())


def _enforce_stat_constraints(values: Dict[str, float]) -> None:
    for result, opportunity in (
        ("passing_completions", "passing_attempts"),
        ("receptions", "targets"),
        ("field_goals_made", "field_goals_attempted"),
        ("extra_points_made", "extra_points_attempted"),
    ):
        if result in values and opportunity in values:
            values[result] = min(values[result], values[opportunity])


def _walk_forward_targets(records: Sequence[PlayerSeason]) -> Iterable[PlayerSeason]:
    first_by_player: Dict[str, int] = {}
    for record in records:
        first_by_player[record.player_id] = min(
            record.season, first_by_player.get(record.player_id, record.season)
        )
    return (
        record
        for record in sorted(records, key=lambda item: (item.season, item.player_id))
        if record.season > first_by_player[record.player_id]
    )


def _history_for_player(
    records: Sequence[PlayerSeason],
    player_id: str,
    before_season: Optional[int] = None,
) -> Sequence[PlayerSeason]:
    return sorted(
        [
            record
            for record in records
            if record.player_id == player_id
            and (before_season is None or record.season < before_season)
        ],
        key=lambda record: record.season,
    )


def _merge_player_team_seasons(records: Sequence[PlayerSeason]) -> Sequence[PlayerSeason]:
    grouped: Dict[Tuple[str, int], List[PlayerSeason]] = {}
    for record in records:
        grouped.setdefault((record.player_id, record.season), []).append(record)
    merged: List[PlayerSeason] = []
    for (_, season), group in sorted(grouped.items()):
        first = group[0]
        values: Dict[str, float] = {}
        counts: Dict[str, int] = {}
        for record in group:
            for name, value in record.values.items():
                values[name] = values.get(name, 0.0) + value
                counts[name] = counts.get(name, 0) + 1
        for name in NON_ADDITIVE_STATS:
            if name in values:
                values[name] /= counts[name]
        primary_team = max(
            group,
            key=lambda record: (
                sum(record.values.get(stat, 0.0) for stat in VOLUME_STATS),
                record.team_id,
            ),
        ).team_id
        merged.append(
            PlayerSeason(
                player_id=first.player_id,
                player_name=first.player_name,
                position=first.position,
                team_id=primary_team,
                season=season,
                values=values,
            )
        )
    return merged


def _metrics(pairs: Sequence[Tuple[float, float]]) -> Metric:
    if not pairs:
        return Metric(0, None, None)
    errors = [predicted - actual for predicted, actual in pairs]
    return Metric(
        sample_size=len(errors),
        mean_absolute_error=round(statistics.fmean(abs(error) for error in errors), 4),
        root_mean_squared_error=round(
            math.sqrt(statistics.fmean(error * error for error in errors)), 4
        ),
    )


def _quantile(values: Sequence[float], probability: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def _validate_request(request: ProjectionRequest) -> None:
    if not isinstance(request.target_season, int) or not 1920 <= request.target_season <= 2100:
        raise ValueError("Target season must be an NFL year between 1920 and 2100.")
    if not request.dataset_version_id:
        raise ValueError("A source dataset version identifier is required.")
    if request.visibility not in {"public", "sample", "private"}:
        raise ValueError("Visibility must be public, sample, or private.")
    if request.visibility == "private" and not request.owner_user_id:
        raise ValueError("Private projection runs require an owner_user_id.")


def _load_psycopg() -> Any:
    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError(
            "psycopg is required for PostgreSQL projections. Install pipelines/requirements.txt."
        ) from error
    return psycopg


def _load_jsonb() -> Any:
    try:
        from psycopg.types.json import Jsonb  # type: ignore[import-not-found]
    except ImportError as error:
        raise RuntimeError(
            "psycopg JSON support is required for projection persistence."
        ) from error
    return Jsonb


def _numeric_mapping(value: Any, label: str) -> Mapping[str, float]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object.")
    return {str(name): _finite_number(number, f"{label}.{name}") for name, number in value.items()}


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be numeric.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite.")
    return number


def _required_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string.")
    return value.strip()


def _bounded(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    return value
