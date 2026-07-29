# Scheduled ADP ingestion

This job retrieves the reviewed Fantasy Football Calculator REST feed, resolves provider identities to
canonical players, stores an immutable public dataset version, and logs only identifiers and counts.

`ADP_CONTEXTS_JSON` is required so the production schedule never assumes a league size or scoring
format. Example:

```json
[
  { "scoringFormat": "ppr", "leagueSize": 10 },
  { "scoringFormat": "ppr", "leagueSize": 12 },
  { "scoringFormat": "half-ppr", "leagueSize": 12 }
]
```

The repository preserves the latest valid snapshot when a provider request or identity resolution fails.
