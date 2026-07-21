# SQL migrations

Drizzle-generated SQL migrations are committed here. Apply them with `pnpm db:migrate`; generation is `pnpm db:generate`.

The initial migrations create the football data, provenance, private ownership, league, draft, trade, and news tables. They contain no private league records or licensed source data. Development fixtures are sample-only and are inserted only with `pnpm db:seed`.
