# Feature definitions

Features are position-specific and derived only from seasons before the target.

| Feature                        | Definition                                                                  | Why selected                                                                         |
| ------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `recent_<stat>`                | Most recent value for a projected position statistic                        | Captures the clearest current workload and production signal.                        |
| `weighted_<stat>`              | Up to three seasons at 60/30/10 recency weights                             | Reduces dependence on one volatile or injury-shortened year.                         |
| `position_average_<stat>`      | Mean among the position in the latest eligible training season              | Provides explicit regression for small or unstable samples.                          |
| `projected_games`              | Recency-weighted games played, bounded to 0-17                              | Converts availability history into season opportunity without using target outcomes. |
| `history_seasons`              | Number of player seasons available before the target                        | Drives confidence and exposes sample depth.                                          |
| `expected_role_factor`         | Optional caller-supplied 0.5-1.5 workload multiplier                        | Represents a reviewed depth-chart/role assumption explicitly.                        |
| `injury_availability_factor`   | Optional bounded factor from reported games missed                          | Makes availability adjustment inspectable instead of burying it in model weights.    |
| `team_offensive_volume_factor` | Latest team opportunity relative to median, damped and bounded to 0.90-1.10 | Adds team context without allowing it to dominate player history.                    |
| `age`                          | Optional age at the target season                                           | Recorded for analysis, but not applied until backtests validate an age curve.        |
| `experience`                   | Optional completed NFL seasons                                              | Recorded for analysis, but not applied in version one.                               |
| `team_changed`                 | Optional 0/1 reviewed context flag                                          | Exposed for later validation; no unproven blanket penalty is applied.                |
| `quarterback_changed`          | Optional 0/1 reviewed context flag                                          | Exposed for later validation; no unproven blanket penalty is applied.                |

## Position outputs

- QB: attempts, completions, passing yards/touchdowns, interceptions, carries,
  rushing yards/touchdowns.
- RB: carries, rushing yards/touchdowns, targets, receptions, receiving
  yards/touchdowns.
- WR: targets, receptions, receiving yards/touchdowns, carries, rushing
  yards/touchdowns.
- TE: targets, receptions, receiving yards/touchdowns.
- K: field goals made/attempted and extra points made/attempted.
- DEF: sacks, interceptions, fumble recoveries, and defensive touchdowns.

Efficiency and touchdown rate are represented by projecting both their opportunity
and result statistics. Snap share remains normalized historical context, but is not
selected in version one because coverage is incomplete. Pace, starts, red-zone
usage, date of birth, and reliable injury history are not fabricated when absent.
