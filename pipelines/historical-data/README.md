# Historical-data pipeline

The only enabled provider is `NflverseHistoricalDataProvider`, which reads nflverse's
weekly player-statistics dataset via `nflreadpy`. It maps provider columns to
application-owned statistic names, validates every record before an atomic repository
write, persists weekly and season player/team aggregates, creates deterministic IDs,
and leaves the last valid dataset untouched whenever a run fails.

Each ingestion report includes exact and confident identity matches, unresolved
identities, ambiguous identities, and duplicate-record counts. Stable NFL/GSIS IDs
are exact; reviewed provider IDs are confident; names are never used as a persistence
identity. Postseason records are excluded from this regular-season dataset.

Run locally into the development-only JSON repository:

```bash
python pipelines/historical-data/run_ingestion.py --seasons 2025 --state-file .local/historical-data.json
```

Scheduled jobs set `DATABASE_URL` and write through `PostgresHistoricalDataRepository`.
The job prints a JSON ingestion report for the workflow summary. See
[`docs/data-sources/nflverse-historical-player-stats.md`](../../docs/data-sources/nflverse-historical-player-stats.md)
for the reviewed source scope, attribution, and operating constraints.

Application code reads these persisted normalized records through
`@fantasyfb/historical-data`; presentation code must not aggregate raw provider rows.
