# Architecture overview

FantasyFB is a pnpm monorepo. `apps/web` owns HTTP and React presentation; it may compose public package exports but cannot contain football business logic or direct database queries. `modules/*` own provider-neutral business capabilities and expose a single root entry point. `packages/*` contain shared contracts and replaceable infrastructure adapters.

## Boundaries

- UI components never call Drizzle. Server composition creates repositories and passes interfaces into domain modules.
- Provider adapters normalize external data before it reaches a module. nflverse and Fantasy Football Calculator details remain inside their later provider implementations.
- Private records require authorization at the server query/action/route boundary. Route groups are organization aids, not the authorization mechanism.
- Draft state will be reduced from an append-only event history. Realtime transports will remain replaceable.
- PostgreSQL and Vercel choices belong to infrastructure, not domain modules.

See [the database schema boundary](./database-schema.md) for the ownership model, versioned provenance, repository contracts, and operational commands.

The `pnpm boundaries` command rejects imports into another workspace's `src` or `internal` path. Workspace package exports are the only supported cross-module import surface.

## Planned data-provider families

`HistoricalDataProvider` is implemented by `NflverseHistoricalDataProvider`. It uses
`nflreadpy` for the reviewed nflverse weekly player-statistics dataset, normalizes
records behind provider contracts, stores player/team weekly and season aggregates,
and preserves the last valid dataset on failure. `@fantasyfb/historical-data` is the
single application-facing module for retrieving those persisted aggregates. See the source review in
[`docs/data-sources/nflverse-historical-player-stats.md`](../data-sources/nflverse-historical-player-stats.md).

Expert projections and rankings now enter through credential-gated authorized APIs or authenticated
private CSV previews. ADP uses `FantasyFootballCalculatorAdpProvider`; each retrieval creates a new
versioned snapshot and should run no more than daily. Missing providers are represented explicitly,
so model outputs continue without fabricated expert values.

`@fantasyfb/ranking-engine` is the single pure interface for league-aware rankings and tiers. It accepts
validated model projections, optional expert and ADP inputs, scoring and roster configuration, explicit
replacement assumptions, and optional hybrid weights. It exposes the active formula and input
availability, never silently substitutes Model Rank for Expert Rank, and requires callers to explicitly
allow weight renormalization when hybrid inputs are incomplete. See the
[ranking methodology](../model-methodology/rankings-and-tiers.md).

`@fantasyfb/player-intelligence` composes normalized player metadata, history, projections, rankings,
ADP, risk, injuries, news, provenance, and freshness behind one research interface. It owns filtering,
sorting, comparisons, and missing/stale-data policy so React routes only render evaluations. The
public research routes use an explicitly synthetic sample adapter; see the
[Player Intelligence architecture](./player-intelligence.md).
