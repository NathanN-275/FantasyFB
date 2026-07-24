# Known limitations

- Version one projects season totals, not weekly matchup outcomes.
- Rookies and players without history regress to a positional average unless
  explicit reviewed context is supplied; no college translation model exists.
- Depth-chart role, age curves, team changes, quarterback changes, injury history,
  red-zone use, starts, snap share, and pace are not inferred from missing data.
- Touchdown and efficiency outputs use transparent historical blending rather than
  specialized rate models.
- K and DEF outputs require normalized source categories and do not include
  distance-tier field goals or points/yards-allowed tiers.
- Scoring conversion covers configured linear stat rates. Threshold, long-play, and
  defense points/yards-allowed bonuses require more granular projections and are
  intentionally excluded.
- Residual intervals describe historical model error. They are not outcome
  probabilities and can be poorly calibrated with small samples or regime changes.
- Team volume context uses a damped latest-season opportunity comparison; it is not
  a play-calling or roster simulation.
- The model does not claim superiority over simple baselines until real-data
  backtests demonstrate it for the relevant position and scoring configuration.
