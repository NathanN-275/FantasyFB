# Ranking and tier methodology

## Module interface

`@fantasyfb/ranking-engine` is a pure, provider-neutral module with one operation:
`createRankingEngine().rank(input)`. The caller supplies normalized canonical player IDs, projections,
optional expert data, an optional ADP snapshot, the active scoring configuration, league and roster
settings, explicit replacement assumptions, and optional hybrid weights. The module performs no I/O and
does not query Drizzle.

All input is validated before ranking. Model and expert projections must identify the active scoring
configuration so projections from incompatible scoring rules cannot be blended. Duplicate canonical
players, invalid uncertainty bounds, incompatible ADP league sizes, excessive bench allocations, and
conflicting provider IDs are rejected. Expert or ADP records without a model projection are ignored with
an explicit warning.

## Model rank and replacement value

For each position, starter demand is derived from the configured lineup. A single-position slot assigns
all of its demand to that position. A flexible slot divides its demand evenly among its eligible
positions. Explicit bench allocation is then added. The default replacement rank is:

```text
ceiling(league size * (starter demand + allocated bench demand))
```

Callers can override a position with either a replacement rank or projected-point baseline. If a position
is not rostered and has no bench allocation or override, its best available projection is the baseline,
which gives its top player zero value over replacement instead of making an unused position appear
valuable. When the required replacement rank exceeds available projections, the last available
projection is used and a warning is returned.

`replacementValue` is the projected points at that baseline. `valueOverReplacement` is model projected
points minus replacement value. Overall Model Rank sorts value over replacement descending. Position
Rank sorts projected points within a position. Ties are resolved by projected points and then canonical
player ID, making replay independent of input order. FLEX eligibility is derived from every configured
multi-position starting slot, including nonstandard superflex settings.

Positional scarcity is the normalized gap between the top projection at a position and its replacement
baseline. ADP value is `overall ADP - Model Rank`; a positive value means the market cost is later than
the model rank.

## Risk and confidence

Risk is bounded from zero to one. It combines 60% inverse model confidence with 40% normalized
floor-to-ceiling width:

```text
risk = 0.60 * (1 - confidence) + 0.40 * min((ceiling - floor) / abs(median), 1)
```

The median denominator has a minimum magnitude of one. When an expert confidence value is present, the
displayed confidence is the average of model and expert confidence. These are comparative uncertainty
indicators, not outcome probabilities.

## Hybrid ranking

Hybrid weights are optional and configurable across four interpretable signals:

- normalized model projection;
- normalized expert projection;
- inverse normalized expert rank;
- normalized risk-adjusted value over replacement.

Weights can be expressed in any nonnegative scale and are normalized to 100%. The result reports the
active formula, input counts, configured weights, per-player effective weights, and missing inputs.

By default, if any positively weighted input is unavailable for any ranked player, no hybrid rankings are
generated. This prevents a silently changing formula. If the caller explicitly enables
`allowRenormalization`, available weights are normalized separately for each player and the output
identifies which inputs were absent. Expert Rank always remains separate from Model Rank and is never
relabeled or fabricated.

## Reproducible tiers

Tiers are not created at fixed ranks or fantasy draft rounds. For each consecutive pair of ranked
players, the module calculates a composite gap from:

- 35% normalized projection gap;
- 35% normalized value-over-replacement gap;
- 15% normalized positional-scarcity gap;
- 15% confidence gap.

A tier boundary occurs when that composite gap is greater than the median gap plus its median absolute
deviation. This robust, data-derived threshold highlights discontinuities while resisting one extreme
value. The same procedure produces overall and position tiers. Overall order uses Hybrid Rank when
generated and otherwise Model Rank.

## Known limitations

- Flexible-slot demand is divided evenly among eligible positions. Users with position-specific draft
  plans should provide replacement overrides.
- Version one uses min-max normalization for hybrid signals; a future backtest may justify a different
  calibration.
- ADP contributes a displayed value signal but not Model Rank unless a caller gives it weight through a
  future versioned formula.
- Tier clustering operates on one ranking pool at a time and does not yet use historical draft outcomes.
- Sparse position pools use the last available projection as a replacement baseline and return a warning.

## Reproducible commands

```bash
pnpm --filter @fantasyfb/ranking-engine test
pnpm --filter @fantasyfb/ranking-engine typecheck
pnpm boundaries
```
