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

The player catalog endpoint is not used by LeagueGateway. Imported rosters retain Sleeper player IDs as external identifiers so unresolved players remain explicit. A later player-resolution workflow can map them to canonical player IDs.

## Failure and freshness policy

League data is fetched on explicit user action and is not presented as continuously synchronized. Rate limits and provider failures are shown to the user; no sample or fabricated league replaces a failed response. Manual and portable modes remain available. Live Sleeper draft polling belongs to the draft event engine and is not enabled by prompt 11.
