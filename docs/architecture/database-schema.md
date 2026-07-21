# Database schema and repository boundary

`@fantasyfb/database` owns the PostgreSQL schema, Drizzle implementation, explicit SQL migrations, and development-only fixture seed. It is an infrastructure package. Football modules import repository contracts from `@fantasyfb/contracts`, never Drizzle or database tables.

## Privacy model

Public football records use `public` visibility; portfolio fixtures use `sample`; data originating from a user's imports, leagues, rankings, projections, drafts, queues, saved players, or trade evaluations is private. Private data has an owning `user_accounts` row. `createRepositories` requires an `AuthorizationContext` for every private query and filters every private ownership query by that immutable account id.

The application must still verify an authenticated identity before constructing this context. This schema reserves `authorized_user_identities` for immutable provider account IDs; Prompt 4 will connect it to the selected OAuth provider.

## Versioning and identity

`data_sources` and `dataset_versions` preserve retrieval, effective timestamp, usage note, validation, freshness, and record count. Dataset versions are unique per public source/version or per private owner/source/version. Projection and ranking output belongs to explicit runs tied to a dataset version, season, kind, visibility, and version metadata.

Players have canonical UUIDs. `player_external_ids` provides a unique `(provider, external_id)` mapping; provider IDs are never canonical primary keys. Weekly and seasonal statistics retain a source dataset version and NFL team, so a traded player's season can contain multiple team rows.

## Drafts and limitations

Draft state is append-only: each event has a per-draft sequence and idempotency key, both database-enforced unique. The repository verifies draft ownership before reading or appending events. State reduction, provider polling, Auth.js/Better Auth integration, and live synchronization belong to later prompts.

`pnpm db:test:reset` is intentionally destructive only to `TEST_DATABASE_URL`; it refuses to run if that URL equals `DATABASE_URL`. A migration-execution integration test is skipped unless the same isolated test URL is configured.
