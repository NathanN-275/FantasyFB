# Player Intelligence module

`@fantasyfb/player-intelligence` is the single application-facing module for player research. Its
interface accepts one normalized, versioned dataset and exposes two queries:

- `directory(query)` applies player search, filters, deterministic sorting, and directory summaries.
- `profile(playerIdOrSlug)` returns the complete normalized player evaluation.

The module hides model/expert/market comparisons, risk-level classification, source freshness,
missing-input reporting, provenance selection, and presentation-ready directory mapping. React
routes do not repeat those rules.

## Input contract

Every dataset declares an evaluation timestamp, season, label, sources, and players. Zod validation
rejects duplicate player or source identities, inconsistent projection bounds, invalid confidence or
risk ranges, and player records referencing unknown sources.

Every source includes its identifier, dataset version, retrieval and optional effective timestamps,
usage note, sample status, and a source-specific freshness window. Freshness is evaluated against the
dataset's explicit `asOf` timestamp so tests and saved research views remain deterministic.

Player inputs can include:

- identity, team, position, bye week, and injury status;
- versioned history;
- model and optional expert projections;
- Model, Expert, and Hybrid ranks;
- ADP;
- normalized risk score and factors;
- attributed news references.

Optional provider values remain absent when unavailable. The module reports gaps instead of
substituting model values for expert values or fabricating neutral defaults.

## Comparisons and status

Projection comparison is model points minus expert points. Rank comparison is expert rank minus
model rank. ADP comparison is ADP minus model rank. Positive rank or ADP gaps therefore mean the
model values the player earlier than the comparison source.

Risk scores map to non-color labels: 0-33 is low, 34-66 is medium, and 67-100 is high. Risk scores
and factors are normalized inputs; this module does not invent an injury or usage model.

A profile is:

- `complete` when every expected research input is present and current;
- `partial` when optional inputs are missing;
- `stale` when any referenced source exceeds its declared freshness window.

Stale status takes precedence over partial status, while missing fields remain listed.

## Web adapter and current limitation

The public `/players` and `/players/[playerId]` routes use an explicit synthetic sample adapter.
Every public player, projection, rank, statistic, headline, and status is labeled as sample data.
The adapter demonstrates directory and profile behavior without exposing private or licensed data.

The existing database stores most normalized inputs, but no composed database adapter yet supplies
bye-week metadata and a normalized risk assessment. A private database-backed adapter should be
added only when those inputs have documented sources. The module interface does not depend on that
future adapter or on Drizzle.
