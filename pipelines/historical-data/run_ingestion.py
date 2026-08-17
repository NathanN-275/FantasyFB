"""CLI entry point for manually scheduled nflverse historical-data ingestion."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from ingestion import (
    HistoricalIngestionService,
    JsonHistoricalDataRepository,
    NflverseHistoricalDataProvider,
    PostgresHistoricalDataRepository,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest reviewed nflverse weekly player statistics.")
    parser.add_argument("--seasons", nargs="+", type=int, required=True)
    parser.add_argument(
        "--state-file",
        type=Path,
        help="Development-only JSON repository. Do not use for scheduled production ingestion.",
    )
    parser.add_argument(
        "--visibility",
        choices=("public", "private"),
        default=os.environ.get("DATA_VISIBILITY", "public"),
        help="Visibility for the persisted dataset. Private datasets require --owner-user-id.",
    )
    parser.add_argument(
        "--owner-user-id",
        default=os.environ.get("OWNER_USER_ID"),
        help="Authenticated FantasyFB user UUID required for private datasets.",
    )
    args = parser.parse_args()
    database_url = os.environ.get("DATABASE_URL")
    if bool(database_url) == bool(args.state_file):
        parser.error("Set exactly one of DATABASE_URL or --state-file.")
    if args.visibility == "private" and not args.owner_user_id:
        parser.error("Private ingestion requires --owner-user-id.")
    if args.state_file and args.visibility == "private":
        parser.error("Private visibility is only supported by the PostgreSQL repository.")

    repository = (
        PostgresHistoricalDataRepository(
            database_url,
            visibility=args.visibility,
            owner_user_id=args.owner_user_id,
        )
        if database_url
        else JsonHistoricalDataRepository(args.state_file)
    )
    reports = HistoricalIngestionService(NflverseHistoricalDataProvider(), repository).ingest(args.seasons)
    completed = all(report.status == "completed" for report in reports)
    print(
        json.dumps(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": "info" if completed else "error",
                "component": "historical-data-ingestion",
                "event": "historical.ingestion.finished",
                "status": "completed" if completed else "degraded",
                "reports": [json.loads(report.to_json()) for report in reports],
            },
            sort_keys=True,
        )
    )
    return 0 if completed else 1


if __name__ == "__main__":
    sys.exit(main())
