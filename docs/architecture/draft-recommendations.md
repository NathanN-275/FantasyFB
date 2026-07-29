# Draft recommendation engine

`@fantasyfb/draft-room` exposes `createDraftRecommendationEngine` beside the append-only event
engine. Its one `recommend` interface accepts reduced draft state, normalized league-aware player
signals, league and lineup configuration, draft ownership, source status, user preferences, and
optional availability outcomes. It returns six independently explained recommendations plus
roster needs, tier warnings, pick forecasts, freshness, and model-evaluation metadata.

## Decision strategies

The engine does not collapse its inputs into one unexplained score. It selects:

- best overall value from value over replacement and the selected rank
- safest selection from floor, risk, and rank
- highest upside from ceiling and the configured risk tolerance
- positional need from open starting-lineup demand and value over replacement
- tier protection from the value drop to the next position tier and positional scarcity
- contrarian selection from transparent rank-versus-ADP and model-versus-expert disagreement

Each result carries the actual Model, Expert, or Hybrid Rank used; current and target position
counts; overall and position tiers; the drop to the next tier; estimated next-pick availability;
ADP difference; roster effect; risk; and a list of human-readable reasons. If the requested Expert
or Hybrid Rank is absent, the engine explicitly labels a Model Rank fallback and emits a warning.
It never relabels model data as expert data.

## Draft order and roster context

Draft order is configuration-driven. The module builds snake or third-round-reversal order from any
configured team count, then applies explicit traded-pick ownership. Keepers and normal selections
already present in reduced draft state are unavailable. Team position counts come from the event
history. Starter demand is calculated by assigning the current roster to the maximum number of
configured lineup slots, then measuring how many remaining slots additional depth at each position
can fill. That avoids double-counting one player across FLEX or SUPERFLEX eligibility while still
distinguishing one open QB slot from two open TE slots. It supports unusual position counts and
custom scoring outputs without assuming league size or Full PPR.

The engine is transport-neutral. `mode` and synchronization metadata make manual and Sleeper
simulations visible, but both use the same deterministic recommendation implementation after a
provider has normalized events.

## Expected availability

The first availability model is deliberately simple:

```text
availability =
  logistic(
    (ADP-or-selected-rank - target-pick) /
    max(4, team-count * 0.45)
  )
  - intervening-position-need adjustment
```

The result is clamped away from zero and one, described as likely, uncertain, or unlikely, and
always presented as an estimate rather than a guarantee. When historical or simulated availability
outcomes are supplied, the result reruns this same model for each recorded player and target pick,
then reports sample count and Brier score. With no outcomes, it says the model is uncalibrated
instead of claiming validation.

## Interface

The public draft simulator renders:

- six recommendation cards with expandable reasoning
- a selectable draft queue and preference watchlist
- position filters shared with the available-player list
- lineup-derived roster needs and tier-drop warnings
- current, next, and following pick forecasts
- pick history from the append-only event engine
- synchronization and manual/Sleeper mode indicators
- projection, ranking, and ADP freshness

The queue and watchlist are local simulator state. Persisting private-user preferences, learning
availability parameters from a larger historical corpus, and adding a live transport beyond the
existing polling seam are intentionally deferred.

## Verification

Module tests cover the six complete recommendation explanations, keeper exclusion, snake and
third-round-reversal forecasts, traded picks, simulated availability evaluation, missing expert
data, custom scoring metadata, unusual starting slots, and Sleeper mode. Existing draft-room tests
continue to cover manual entry, Sleeper polling, deterministic replay, keepers, and provider
interruptions.
