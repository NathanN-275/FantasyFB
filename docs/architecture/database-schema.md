# Database schema and repository boundary

`@fantasyfb/database` owns the PostgreSQL schema, Drizzle implementation, explicit SQL migrations, and development-only fixture seed. It is an infrastructure package. Football modules import repository contracts from `@fantasyfb/contracts`, never Drizzle or database tables.

## Privacy model

Public football records use `public` visibility; portfolio fixtures use `sample`; data originating from a user's imports, leagues, rankings, projections, drafts, queues, saved players, or trade evaluations is private. Private data has an owning `user_accounts` row. `createRepositories` requires an `AuthorizationContext` for every private query and filters every private ownership query by that immutable account id.

The application must still verify an authenticated identity before constructing this context. `authorized_user_identities` stores immutable provider account IDs, and `auth_sessions` stores the server-side sessions created by Better Auth. Private authorization compares the GitHub provider account ID to configuration; it does not use email, display name, or GitHub username.

## Versioning and identity

`data_sources` and `dataset_versions` preserve retrieval, effective timestamp, usage note, validation, freshness, and record count. Dataset versions are unique per public source/version or per private owner/source/version. Projection and ranking output belongs to explicit runs tied to a dataset version, season, kind, visibility, and version metadata. Model projection runs also retain the scoring configuration identifier, training season range, and backtest/calibration metrics. Player outputs retain projected games, statistics, total and per-game points, uncertainty bounds, and confidence.

Players have canonical UUIDs. `player_external_ids` provides a unique `(provider, external_id)` mapping; provider IDs are never canonical primary keys. Weekly and seasonal statistics retain a source dataset version and NFL team, so a traded player's season can contain multiple team rows.

## Drafts and limitations

Draft state is append-only: each event has a per-draft sequence and idempotency key, both
database-enforced unique. The repository verifies draft ownership before reading or appending
events. `@fantasyfb/draft-room` stores a versioned normalized event envelope in `payload`, derives
current state by deterministic replay, and keeps Sleeper, manual, fixture, and companion sources
outside the database adapter. See [Draft Event Engine](./draft-event-engine.md).

`pnpm db:test:reset` is intentionally destructive only to `TEST_DATABASE_URL`; it refuses to run if that URL equals `DATABASE_URL`. A migration-execution integration test is skipped unless the same isolated test URL is configured.

## Saved trade evaluations

`TradeRepository.save` always supplies `owner_user_id` from the server authorization context; the
browser cannot choose it. A referenced league configuration is checked against that same owner
before insert. The stored side definitions and complete normalized result preserve the assumptions
and warnings used for the evaluation, while `list` filters and orders records only within the
authorized account. Public trade demonstrations do not use this repository.
