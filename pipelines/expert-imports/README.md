# Expert imports and ADP snapshots

Prompt 8 is implemented by the provider-neutral `@fantasyfb/expert-data` module, owner-scoped
database repositories, and authenticated Next.js routes.

## Private CSV workflow

`POST /api/private/expert-imports` accepts multipart form data only after the Better Auth private
access check succeeds. The route:

1. rejects files over 1 MB, non-CSV extensions, unsupported MIME types, binary content, malformed
   CSV, and missing configured columns;
2. parses the file on the server with an explicit import profile;
3. resolves provider IDs first, then normalized player name plus optional team and position;
4. stages normalized rows and reports matched, ambiguous, missing, and invalid players;
5. returns a preview without creating expert projections or rankings.

`POST /api/private/expert-imports/:importId/confirm` is a separate authenticated operation. It
persists only matched rows into private expert projection and ranking runs. Unresolved rows remain
visible in the import audit record and are skipped. The original CSV is never written to the
repository or a build artifact. Its contents are discarded unless the authorized user explicitly
selects private preservation.

The browser form exposes a standard configurable profile. API callers may additionally map
arbitrary numeric statistic columns through `columns.statistics`.

## Authorized API provider

`AuthorizedExpertApiProvider` is disabled unless `EXPERT_API_URL` is a valid HTTPS URL and
`EXPERT_API_TOKEN` exists. It sends the token only as a Bearer credential to that configured
endpoint. The expected JSON body is:

```json
{
  "projections": [
    {
      "providerPlayerId": "optional",
      "fullName": "Player Name",
      "projectedPoints": 250.5,
      "statistics": { "receptions": 80 }
    }
  ],
  "rankings": [
    {
      "providerPlayerId": "optional",
      "fullName": "Player Name",
      "overallRank": 1,
      "positionRank": 1
    }
  ]
}
```

`POST /api/private/expert-imports/authorized` loads and validates that response through an
authenticated route, resolves its player identities, and creates the same owner-scoped confirmation
preview used by private CSV imports.

No commercial ranking site scraper exists. `NoExpertDataProvider` supplies the explicit fallback:
expert fields are hidden, model fields stay enabled, and the provider absence is explained.

## ADP

`FantasyFootballCalculatorAdpProvider` calls the permitted JSON REST API and normalizes provider,
scoring format, league size, season, overall ADP, derived positional ADP, minimum and maximum pick,
sample size, and retrieval time. Every retrieval creates a new dataset version; existing snapshots
are never updated in place. Provider-to-canonical player mismatches are reported rather than
invented.

The provider publishes new values once per day. Do not refresh the same season, scoring, and league
size more than daily.
