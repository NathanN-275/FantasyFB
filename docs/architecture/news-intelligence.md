# News Intelligence

`@fantasyfb/news-intelligence` is the single public domain boundary for news aggregation. It accepts
an explicitly permitted feed configuration plus canonical player/team candidates and returns
normalized, attributable records. Provider JSON never leaves the module.

## Normalization and attribution

Each record retains its headline, source identity, original article URL, nullable publication time,
retrieval time, permitted excerpt, reported feed fields, matched players and teams, category,
explicitly reported injury information, entity confidence, and freshness. Only a source-supplied
summary or content allowed by the configured excerpt policy can enter the excerpt field.

Application-generated fantasy interpretation is stored separately from reported facts. Its
reasoning names the category and entity evidence used. Injury designations are captured only when
the designation appears explicitly in the feed text; sentiment never creates an official status.

## Matching, deduplication, and failure behavior

Player matching uses exact normalized full names or declared aliases. Ambiguous names create a
warning and no player relationship. Player matching does not depend on the current NFL team, so
trade reports can retain both prior and current team context.

Canonical URLs remove tracking parameters. Duplicate URLs and same-day syndicated headlines collapse
to one richer record while preserving entity relationships. Missing timestamps remain null and have
unknown freshness.

The scheduled shell asks `NewsRepository` for the last valid source snapshot before retrieval. If a
provider is unavailable or malformed, the module returns that snapshot as preserved and the
repository is not overwritten. A failed source without prior valid data is unavailable and makes
the scheduled job fail visibly.

## Persistence and presentation

`@fantasyfb/database` persists snapshots to portable PostgreSQL/Neon tables with dataset provenance,
deduplication keys, freshness indexes, related-player rows, and normalized related teams. React
surfaces query only the repository or explicit synthetic fixtures; they never call Drizzle.

The public demo is fixture-only. Production source configuration and bearer tokens are GitHub
Actions secrets and are not exposed to the browser.
