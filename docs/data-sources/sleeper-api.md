# Sleeper API

## Status

Approved for prompt 11 league discovery and read-only import.

## Source

- Provider: Sleeper
- Documentation: <https://docs.sleeper.com/>
- Base URL: `https://api.sleeper.app/v1`
- Authentication: none; the documented API is read-only
- Usage guidance: remain below 1,000 calls per minute

## Endpoints used

- `GET /user/{username}`
- `GET /user/{user_id}/leagues/nfl/{season}`
- `GET /league/{league_id}`
- `GET /league/{league_id}/users`
- `GET /league/{league_id}/rosters`
- `GET /league/{league_id}/drafts`
- `GET /draft/{draft_id}/picks`

The player catalog endpoint is not used by LeagueGateway. Imported rosters retain Sleeper player IDs as external identifiers so unresolved players remain explicit. A later player-resolution workflow can map them to canonical player IDs.

## Failure and freshness policy

League data is fetched on explicit user action and is not presented as continuously synchronized.
Rate limits and provider failures are shown to the user; no sample or fabricated league replaces a
failed response. Manual and portable modes remain available.

The draft event engine polls picks on explicit action. Duplicate snapshots add no events, a response
that falls behind the highest observed pick is marked stale, and transport or rate-limit failures
leave the last persisted event history replayable. Sleeper player IDs remain external until a
`player_mapping_resolved` event connects them to canonical players.
