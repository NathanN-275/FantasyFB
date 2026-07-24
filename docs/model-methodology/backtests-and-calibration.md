# Backtests and calibration

## Evaluation design

Every run performs expanding-window walk-forward evaluation. A target player-season
is predicted only from earlier seasons. The same scoring configuration used for the
run converts actual and predicted statistics to fantasy points.

The final model is compared with:

- previous-season fantasy points;
- previous-season points per game times independently projected games;
- the 60/30/10 multi-season weighted average;
- the latest eligible positional average.

Each run exports sample size, mean absolute error (MAE), and root mean squared error
(RMSE) overall and by position. Calibration uses only residuals available before
each evaluated row, then reports empirical coverage and mean width for the
position-specific 80th-percentile absolute-residual interval.

## Checked-in synthetic fixture result

The deterministic test fixture contains two players at each supported position over
2022-2025. It validates calculation and comparison behavior; it is not representative
NFL evidence.

| Model                         | Samples |    MAE |    RMSE |
| ----------------------------- | ------: | -----: | ------: |
| Final transparent model       |      36 | 8.1458 |  8.6481 |
| Previous-season points        |      36 | 7.7747 |  8.1992 |
| Previous-season points/game   |      36 | 7.6970 |  8.8547 |
| Multi-season weighted average |      36 | 9.9343 | 10.6145 |
| Positional average            |      36 | 7.7747 | 11.5954 |

The interval calibration sample contains 24 observations, with 75% empirical
coverage and mean width 17.2257 points. That slight under-coverage is expected from the
small, steadily increasing synthetic series and demonstrates why fixture results
must not be advertised as calibrated production accuracy.

The fixture does not establish that the final model beats every simple baseline.
Production acceptance requires rerunning these tables on sufficiently deep, real,
normalized history and evaluating by position and scoring profile.
