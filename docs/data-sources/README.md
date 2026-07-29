# Data sources

No external data is ingested in the repository foundation.

Before enabling an nflverse dataset, document its dataset-specific license, required attribution, fields, refresh behavior, and validation rules here. Do not enable supplemental data derived from ESPN, Pro Football Reference, FTN, or other third parties until their reuse requirements have been reviewed.

Fantasy Football Calculator ADP is enabled through its documented JSON REST API. Its current usage,
attribution, coverage, and update-frequency review is recorded in
[`fantasy-football-calculator-adp.md`](./fantasy-football-calculator-adp.md). Private CSV imports
record their source and remain scoped to the authorized owner.

News aggregation has no built-in third-party source. Its permission gate, source-review checklist,
and supported JSON Feed boundary are documented in [`news-feeds.md`](./news-feeds.md).
