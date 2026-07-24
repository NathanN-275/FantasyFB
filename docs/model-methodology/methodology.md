# Transparent projection methodology

## Objective and boundary

The model produces regular-season statistical and fantasy-point projections from
normalized historical player/team seasons. It never loads provider-shaped records.
All records with a season greater than or equal to the target are rejected before
training or persistence.

Separate QB, RB, WR, TE, K, and DEF models use position-specific output statistics.
K and DEF are supported only when their normalized historical categories exist.

## Interpretable model

For each position and statistic, version one calculates:

1. the most recent season value;
2. a recency-weighted average of at most three seasons, using 60%, 30%, and 10%;
3. the prior-season positional average;
4. a blend of recent and weighted player values;
5. regression of that blend toward the positional average.

The recent-season weight and positional shrinkage are selected independently for
each position from four documented candidates:

| Recent weight | Positional shrinkage |
| ------------: | -------------------: |
|          0.60 |                 0.10 |
|          0.75 |                 0.10 |
|          0.75 |                 0.20 |
|          0.90 |                 0.10 |

Selection minimizes walk-forward mean absolute error across that position's
available statistical targets. There is no neural network or opaque ensemble.
Selected parameters are saved in every projection run.

Optional current context is explicit. Expected role scales usage between 0.5 and
1.5. Reported injury games missed applies a bounded availability adjustment. Team
offensive volume applies only a damped, 0.90-1.10 factor to opportunity statistics.
Age, experience, team changes, and quarterback changes are recorded as features but
do not change version-one outputs because no validated causal adjustment has been
established.

## Scoring and uncertainty

Projected statistics are converted with the caller's required scoring identifier
and stat-to-point rates. No scoring preset is selected by the model.

The projected fantasy-point total is the median. The floor and ceiling are the
median minus/plus the position's walk-forward 80th percentile absolute residual,
with a zero floor. Confidence combines history depth and residual dispersion and is
bounded to 0-0.95. These are model uncertainty summaries, not guaranteed outcomes.

## Validation and persistence

Before writing, the pipeline checks finite values, 0-17 projected games, consistent
run/output versions and scoring identifiers, matching seasons, confidence in 0-1,
and `floor <= median <= ceiling`. PostgreSQL writes a run and all player outputs in
one transaction. JSON development output uses an atomic file replace.
