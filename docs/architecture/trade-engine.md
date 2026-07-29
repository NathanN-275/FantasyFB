# Trade engine

`@fantasyfb/trade-engine` is the single provider-neutral interface for evaluating one-for-one and
multi-player trades. Callers submit normalized league, roster, player, projection, ranking, injury,
and optional schedule context to `createTradeEngine().evaluate(input)`. The module validates the
entire request and returns package totals plus before-and-after roster analysis; callers do not
coordinate scoring helpers, lineup optimizers, or replacement logic.

## Evaluation model

The implementation is deterministic and side-effect-free. It:

1. Uses only projections whose scoring-configuration identifier matches the active league.
2. Blends model and optional expert projections with disclosed, configurable weights.
3. Applies disclosed injury-availability and supplied schedule-context factors.
4. Solves each starting lineup as a global weighted assignment, including multi-position FLEX
   slots, rather than greedily filling positions.
5. Values bench players only above the disclosed position replacement level.
6. Restores equal roster sizes after uneven packages by adding an explicit replacement assumption
   or modeling the least damaging legal drop.
7. Compares raw package value with starting-lineup, bench, replacement, scarcity, consolidation,
   risk, floor, ceiling, short-term, and full-season effects.

The output does not declare a trade fair from a sum of trade-chart numbers. Written explanations
describe how each receiving roster changes. `packageConsolidationValue` is the difference between
the receiving roster's context-value change and the raw package-value change; it exposes the value
created or lost by lineup fit, bench displacement, and open roster spots.

## Generic mode

When no league is supplied, the result is labeled `generic`. The returned assumptions show the
12-team full-PPR identifier, starting slots, bench size, three-week horizon, projection weights,
position replacement levels, and injury factors actually used. Callers may override the roster and
assumption inputs without pretending a real league was selected.

Generic replacement levels are comparison assumptions, not current waiver-wire claims. A selected
league should eventually supply replacement levels derived from its current player pool.

## Missing data and limitations

- A traded player without a compatible model projection receives zero value and a warning; the
  module never fabricates a projection.
- Expert data is optional. When unavailable, model data carries the evaluation rather than being
  relabeled as expert data.
- Schedule context is optional and enters only through caller-supplied, bounded factors with an
  explanation.
- Injury factors are transparent heuristics, not medical forecasts.
- The current module evaluates players only. Draft picks and future assets require a separately
  versioned dynasty-value model before they can enter this interface.
- Replacement additions and modeled drops support analysis; they do not execute roster
  transactions.

## Privacy and persistence

The public `/trade-demo` route imports a dedicated synthetic fixture and never queries a private
roster. Private saves post the normalized input to an authenticated server route. The server
revalidates and re-evaluates the trade, then writes through `TradeRepository` with the authorized
user ID. If a league configuration is referenced, the repository verifies that the same user owns
it before saving. Lists are filtered by that owner ID.

## Verification surface

Tests cross the same `evaluate` interface used by callers. They cover one-for-one, two-for-one,
three-for-two, empty slots, bench upgrades, scarcity, injuries, missing projections, equal raw
values with different roster fit, custom scoring identifiers, custom league sizes, and generic
assumptions. Route tests verify authenticated list/save composition, and Playwright covers the
fixture-only multi-player workflow.
