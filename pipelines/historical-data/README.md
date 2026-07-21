# Historical-data pipeline

The only enabled provider is `NflverseHistoricalDataProvider`, which reads nflverse's
weekly player-statistics dataset via `nflreadpy`. It validates every record before an
atomic repository write, quarantines malformed responses, creates deterministic IDs,
and leaves the last valid dataset untouched whenever a run fails.

Run locally into the development-only JSON repository:

```bash
python pipelines/historical-data/run_ingestion.py --seasons 2025 --state-file .local/historical-data.json
```

Scheduled jobs set `DATABASE_URL` and write through `PostgresHistoricalDataRepository`.
The job prints a JSON ingestion report for the workflow summary. See
[`docs/data-sources/nflverse-historical-player-stats.md`](../../docs/data-sources/nflverse-historical-player-stats.md)
for the reviewed source scope, attribution, and operating constraints.
