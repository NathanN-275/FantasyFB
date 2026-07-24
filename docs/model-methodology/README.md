# Projection model documentation

The first projection model is implemented and versioned as
`transparent-baseline-v1.0.0`, using feature set `position-features-v1.0.0`.

- [Methodology](./methodology.md) explains training, scoring, uncertainty, and output validation.
- [Feature definitions](./feature-definitions.md) records every selected feature and why it exists.
- [Backtests and calibration](./backtests-and-calibration.md) defines the evaluation and reports the checked-in synthetic-fixture result.
- [Known limitations](./known-limitations.md) states what version one cannot support or claim.
- [Pipeline commands](../../pipelines/projections/README.md) reproduce generation and verification.

Every production run carries its own backtest and calibration report. The
checked-in table is test evidence, not a claim of expected 2026 accuracy.
