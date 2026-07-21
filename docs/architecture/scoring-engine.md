# Scoring engine

`@fantasyfb/fantasy-core` owns the provider-neutral football domain and its pure scoring engine. It has no database, network, clock, or provider dependency. Provider adapters must map source stat keys into the exported `StatLine` shape before scoring.

## Supported scoring categories

The engine supports passing, rushing, receiving, return, kicker, and defense/special-teams categories: yards, touchdowns, receptions, interceptions, two-point conversions, and first downs where relevant; made and missed field goals and extra points; sacks, interceptions, fumble recoveries and forced fumbles, safeties, blocks, and defensive touchdowns. It also supports custom named values, yardage thresholds, long-play bonuses, and defense points/yards-allowed tiers.

The included Full PPR, Half PPR, and Standard profiles are explicit options only. The application must choose a profile or submit custom rules; the engine never chooses one.

## Calculation policy

- Decimal and negative values are preserved. Totals are not rounded by the engine; presentation code owns any display rounding.
- An absent configured value contributes no points and is reported in `missingStats`. It is never silently fabricated as a recorded zero.
- Unknown top-level input fields are ignored and returned in `unsupportedFields` with a warning. Custom values without a matching rule also warn.
- Every satisfied threshold or long-play rule applies independently. A qualifying play can receive both its base category points and every matching configured bonus. Defense tiers use the most restrictive matching `atMost` threshold.

## Extension procedure

1. Add a provider-neutral canonical category to `STAT_CATEGORIES` and its validation schema.
2. Add calculation behavior and focused tests before adapters use the new field.
3. Document its missing-value and bonus interaction policy here.
4. Normalize provider-specific names in a later provider adapter; do not import provider APIs into this module.
