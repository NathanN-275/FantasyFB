# Draft guide

## Module seam

`@fantasyfb/draft-guide` is the single interface for building a versioned draft guide. Callers pass
one validated build input to `generateDraftGuide`; the module returns every strategy, tier, target,
checklist, glossary, warning, and source note required by the web and printable views.

The module is deterministic and performs no I/O. Provider payloads, Drizzle records, and React
elements do not cross its interface. The application composes normalized projection, ranking,
historical, ADP, roster-context, and documented editorial inputs before calling the generator.

## Input invariants

Each guide build records:

- season and generation timestamp;
- every dataset version;
- projection and ranking versions;
- the ADP snapshot identifier when available;
- active scoring assumptions;
- team count, roster size, and starting-lineup assumptions.

Every player record has model projection and ranking source references. Optional ADP, historical,
roster, and editorial inputs carry their own source references. Validation rejects:

- duplicate source, player, slug, or model-rank identifiers;
- sources retrieved after the guide build;
- source references whose kind does not match the signal;
- projection ranges that do not contain the projected value;
- unknown handcuff targets; and
- handcuff targets that are the same player or a player on another NFL team.

This keeps evidence validation at the module seam rather than spreading it across React routes.

## Player-specific claims

The generator attaches one or more `GuideEvidence` records to every player callout. Each evidence
record names the source, dataset version, and signal used. A player-specific callout cannot be
created without evidence.

The first implementation uses reproducible rules:

- sleepers: a documented sleeper tag or Model Rank at least eight picks earlier than ADP;
- breakouts: a documented breakout tag, or at least 15% recent historical growth plus at least 15%
  model ceiling above the median projection;
- bust risk: a documented risk tag, model risk of at least 60/100, or ADP at least eight picks
  earlier than Model Rank;
- rookies: zero validated NFL experience or a documented rookie tag;
- handcuffs: an explicit same-team roster-context relationship;
- late-round targets: a documented tag, or a model rank after round six that is no later than ADP;
- large market differences: an absolute Model Rank versus ADP gap of at least eight picks.

These thresholds are guide-generation behavior, not statements of certainty. When the required data
is missing, the guide renders an explicit unavailable state and records a build warning.

## Interface behavior

The public sample route is `/draft-guide`. It includes:

- overall, position, league-size, and scoring-format strategy;
- round targets and reproducible tiers;
- sleepers, breakouts, bust risk, rookies, handcuffs, and late targets;
- bye-week, roster-construction, and position-scarcity guidance;
- Model Rank versus ADP differences;
- a draft-day checklist and fantasy glossary;
- position and section navigation;
- links to player research pages;
- per-claim evidence disclosures;
- build versions, source notes, and last-updated information;
- a `?view=print` layout plus print CSS; and
- responsive layouts for narrow screens.

Public fixtures are synthetic and labeled on the page. Private or licensed inputs must be composed
only inside an authenticated server boundary in a later private-workspace integration.

## Known limitations

- The public fixture intentionally has no validated rookie or handcuff records, so those sections
  demonstrate honest unavailable states.
- The first version uses explicit thresholds rather than a learned editorial classifier.
- ADP is treated as an estimate for timing and never as a guarantee of availability.
- The web route does not persist guide builds; persistence can be added behind a repository
  interface when private guide history is required.
