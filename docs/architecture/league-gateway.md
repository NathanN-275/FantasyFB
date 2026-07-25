# League gateway

`@fantasyfb/league-gateway` is the single interface for turning league-provider data, manual configuration, or portable JSON into one validated `NormalizedLeague`. Provider payloads do not leave the module, and React code does not contain provider mappings.

## Interface

Callers use three operations:

- `discover` finds a user's Sleeper leagues for an explicit season.
- `normalize` accepts a selected Sleeper league, complete manual/ESPN configuration, or portable FantasyFB JSON.
- `exportPortable` validates and serializes a normalized league using the versioned `fantasyfb-league` format.

The normalized result includes league identity, provider, team count, scoring rules, roster configuration, managers, teams, external roster player IDs, draft identity/status/order, provider capabilities, unsupported scoring fields, and warnings. Canonical league IDs are generated independently from provider league IDs.

## Provider adapters

The Sleeper adapter uses only documented public, read-only endpoints:

- user lookup
- leagues for a user and season
- league details
- league users
- league rosters
- league drafts

No Sleeper password or token is requested. The adapter validates every response before normalization. HTTP 429 becomes an explicit `rate-limited` error with retry information when supplied; other transport and provider failures become `provider-failure` errors. Manual mode does not depend on Sleeper and remains usable during an outage.

Known Sleeper scoring keys map to the canonical scoring engine. Unknown or conflicting keys are preserved in `unsupportedFields` with their values and a reason; they do not silently affect scoring. Unknown roster positions are retained with empty eligibility and a warning requiring manual review.

## ESPN posture

ESPN support is a manual provider profile only. Its capability data explicitly reports:

- automatic league import unavailable
- automatic draft synchronization experimental and disabled
- manual mode available
- portable imports available

The gateway does not accept, model, request, or store ESPN passwords, `espn_s2`, `SWID`, authentication cookies, or browser session data. No deployed ESPN scraper exists.

## Portable format and privacy

Portable JSON is strict and versioned. Import validates cross-record manager, team, and draft-order references and rejects unknown top-level fields. The authenticated workspace routes enforce authorization before provider access or parsing.

The prompt 11 workspace keeps the selected normalized result in the current browser session and lets the user download portable JSON. Database persistence is intentionally not added to the gateway: storage remains a separate repository concern, and unresolved provider player IDs must not be fabricated as canonical player records.

## Testing

The module interface tests cover custom league sizes, unsupported scoring fields, missing manager/roster/draft records, Sleeper rate limiting, provider failure with manual fallback, ESPN capability disclosure, and portable import/export round trips. Private route tests verify signed-out and unauthorized requests are rejected before any provider or normalization work.
