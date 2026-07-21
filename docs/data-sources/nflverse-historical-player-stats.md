# nflverse weekly player statistics

## Approved scope

The historical-data pipeline enables only nflverse's `player-stats-weekly` dataset,
loaded through `nflreadpy.load_player_stats(..., summary_level="week")`. The provider
does not enable FTN-derived data, Next Gen Stats, player projections, rankings, ADP,
or any other supplemental dataset.

## License and attribution

`nflverse-data` is licensed under [CC BY 4.0](https://github.com/nflverse/nflverse-data).
Every dataset version stores this license note and should present the attribution
"Data: nflverse / nflverse-data" wherever the data is surfaced. `nflreadpy` is an
MIT-licensed access library, not the license for the downloaded data; its
[documentation](https://nflreadpy.nflverse.com/api/load_functions/) identifies the
weekly player-statistics loader.

The source review was completed on 2026-07-20. Review the dataset license, fields,
and upstream availability before enabling any additional nflverse loader. In
particular, do not mix FTN data into this dataset because it has different licensing.

## Refresh and validation

The GitHub Actions job runs weekly and may be dispatched manually. It validates each
record for a stable player identifier, season, week, team, player name, and numeric
statistics. A malformed record quarantines the whole attempted season rather than
publishing a partial replacement. Successful records are versioned by a deterministic
SHA-256 content hash and carry CC BY attribution, retrieval time, and effective time.
