# FantasyFB

FantasyFB is a personal-first fantasy football analysis platform for the 2026 NFL season. Its purpose is to turn league-specific settings, football data, projections, rankings, and draft activity into understandable recommendations—without coupling the core analysis to a particular league provider, data source, or deployment platform.

The project is a modular monorepo with a provider-neutral football domain, tested scoring,
projection, ranking, player-intelligence, league-gateway, draft-event, trade, and news modules, a
web application, and a PostgreSQL repository layer.

## Goal

Build a private workspace that helps its owner make better fantasy-football decisions while retaining control over their league data and making every input and result traceable. A separate public demo can show the product with clearly labeled sample data, never private league information.

## How it will work

1. **Configure or import a league.** A private, authenticated workspace will store league settings, roster rules, scoring rules, draft history, and authorized imports.
2. **Collect and normalize data.** Provider adapters will ingest permitted historical data, ADP, and private CSV data, then translate them into one canonical football model with provenance metadata.
3. **Calculate league-specific value.** The scoring engine applies the league's explicit rules to normalized statistics. Projection and ranking modules will build on those consistent inputs.
4. **Support decisions.** The application will surface player intelligence, rankings, draft recommendations, trade evaluations, and permitted news in the context of the configured league.
5. **Keep the result explainable.** Dataset versions, source details, model versions, scoring breakdowns, and ranking rationale are modeled so outputs can be traced back to their inputs.

## Current implementation and planned path

| Capability                 | Status                 | Intended outcome                                                                                                                        |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Public web shell           | Implemented            | A Next.js public demo using sample data only.                                                                                           |
| Private workspace boundary | Implemented            | GitHub OAuth, immutable account-ID allowlisting, server-side sessions, and protected workspace shell.                                   |
| Canonical football domain  | Implemented            | Shared player, team, league, draft, ranking, projection, ADP, and provenance types.                                                     |
| Scoring engine             | Implemented and tested | Deterministic, configurable scoring for common fantasy categories, bonuses, and defensive tiers.                                        |
| Database foundation        | Implemented            | PostgreSQL schema for users, provenance, imports, league settings, statistics, projections, rankings, ADP, drafts, trades, and news.    |
| Expert/ADP/private imports | Implemented            | Authenticated CSV previews and confirmation, credential-gated expert APIs, and attributed versioned ADP snapshots.                      |
| Projections                | Implemented and tested | Versioned transparent position models, walk-forward backtests, configurable scoring, uncertainty, and validated persistence.            |
| Rankings                   | Implemented and tested | League-aware Model, Expert, Hybrid, FLEX, replacement-value, scarcity, ADP-value, and reproducible tier outputs.                        |
| Player intelligence        | Implemented and tested | Normalized player evaluations, directory filters, profile comparisons, historical charts, provenance, and freshness states.             |
| League gateway             | Implemented and tested | Normalized Sleeper discovery/import, full manual and ESPN profiles, provider capabilities, and portable league JSON.                    |
| Draft event engine         | Implemented and tested | Append-only events, Sleeper/manual/fixture sources, deterministic replay, persistence, board controls, and stale/interrupted status.    |
| Draft recommendations      | Implemented and tested | League-aware, explained strategies built on replayed draft state with interpretable availability forecasts.                             |
| Multi-player trade engine  | Implemented and tested | Optimized before/after lineups, bench and replacement value, risk ranges, generic assumptions, and authorized private saves.            |
| News intelligence          | Implemented and tested | Permission-gated feeds, deduplication, entity/category filters, fact/interpretation separation, freshness, persistence, and scheduling. |
| Data-driven draft guide    | Implemented and tested | Versioned strategy, round targets, tiers, evidence-backed player callouts, print/mobile views, checklist, glossary, and source notes.   |

## Design choices

- **Personal-first privacy:** public and private experiences are separate. Public routes use sample data; authorization is enforced at server query, action, and route boundaries rather than by client routing alone.
- **Provider-neutral core:** football modules do not depend on ESPN, Sleeper, nflverse, or any other external provider. Adapters normalize external payloads before they reach the domain.
- **Traceable data and outputs:** externally sourced and generated records carry provenance. Dataset, feature, model, and ranking versions are retained to support reproducibility and investigation.
- **Deterministic scoring:** the scoring engine is a side-effect-free module with validated rules and inputs. It reports missing and unsupported values instead of silently inventing data or choosing a scoring profile.
- **Replaceable infrastructure:** the web app uses Vercel, the database uses PostgreSQL on Neon, and Drizzle owns typed database access and migrations. These are infrastructure decisions behind interfaces, not dependencies of business modules.
- **Event-based drafts:** draft state is derived from an append-only normalized event history,
  allowing polling or another realtime transport to change without changing replay logic.
- **Conservative integrations:** external datasets, APIs, and imports are not enabled until licensing, attribution, usage limits, validation, and data freshness requirements are documented.

## Repository layout

- `apps/web` — Next.js public demo and private workspace shell.
- `apps/espn-companion` — reserved, optional experimental browser companion; it is disabled by default and will not collect credentials, cookies, or unrelated browsing data.
- `modules/fantasy-core` — canonical football domain and deterministic scoring engine.
- `modules/player-intelligence` — normalized player research, comparisons, filters, risk, and freshness policy.
- `modules/league-gateway` — provider-neutral league configuration, Sleeper read-only import, manual/ESPN profiles, and portable JSON.
- `modules/draft-room` — append-only draft events, deterministic replay, provider polling, and
  synchronization state.
- `modules/trade-engine` — deterministic multi-player package, lineup, bench, replacement, risk,
  and roster-context analysis.
- `modules/news-intelligence` — permission-gated feed normalization, deduplication, entity matching,
  filters, freshness, and separated fantasy interpretation.
- `modules/draft-guide` — deterministic, versioned guide generation with evidence-backed player
  callouts, structured strategy, explicit unavailable states, and build warnings.
- `modules/*` — provider-independent capabilities for data cataloging, projections, rankings,
  player intelligence, leagues, drafts, trades, and news.
- `packages/*` — shared contracts plus authentication, database, storage, observability, and UI infrastructure boundaries.
- `pipelines` — Python and TypeScript pipelines for historical data, projections, expert imports,
  and scheduled news aggregation.
- `docs` — architecture notes, design decisions, data-source requirements, and model methodology.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example apps/web/.env.local
pnpm dev
```

`DATABASE_URL`, `AUTH_SECRET`, GitHub OAuth settings, and `AUTHORIZED_GITHUB_USER_IDS` are validated when a private route or auth handler is used. The allowlist is a comma-separated set of immutable GitHub user IDs, not usernames. The public demo starts without private-workspace credentials.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:python
pnpm build
pnpm db:migrations:check
pnpm db:validate
```

See [architecture documentation](./docs/architecture/overview.md) for boundaries and [decisions](./docs/decisions) for the foundational trade-offs.
Production setup, release validation, observability, and recovery are documented in the
[`docs/operations`](./docs/operations/deployment.md).
