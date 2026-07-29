# Observability and data health

## Log contract

Server and TypeScript job logs are one-line JSON records with:

- UTC timestamp
- severity level
- component
- stable event name
- environment
- correlation ID when available
- identifiers, versions, statuses, durations, and counts relevant to the event

Python historical and projection entry points emit the same core fields. GitHub Actions uploads job
output as release diagnostics.

`@fantasyfb/observability` redacts credential-shaped keys, bearer values, and PostgreSQL URLs. That
sanitizer is a final defense. Code must still avoid sending raw provider responses or private objects
to the logger.

Never log:

- OAuth tokens or session cookies
- database URLs, role passwords, or restore credentials
- expert/news provider tokens
- private CSV contents or parsed private import rows
- ESPN credentials, cookies, or unrelated page content
- full private league, roster, draft, or trade payloads

The following operational events are implemented:

| Event                        | Purpose                                      |
| ---------------------------- | -------------------------------------------- |
| `health.checked`             | Public process liveness check                |
| `data-health.checked/failed` | Private operational inspection               |
| `draft.sync.*`               | Authorized replay/read/append status         |
| `historical.ingestion.*`     | Historical dataset job result                |
| `adp.snapshot.*`             | ADP provider, resolution, and persistence    |
| `news.provider.failed`       | Provider failure and last-valid preservation |
| `news.ingestion.finished`    | Normalized news job summary                  |
| `projection.run.completed`   | Versioned model-run metadata                 |

## Correlation IDs

Middleware accepts a constrained `x-correlation-id` or creates a UUID, passes it to the server request,
and returns it on the response. Public health and draft synchronization use the same identifier in
structured logs. User-safe internal-error responses return the correlation ID without exposing the
underlying exception.

When diagnosing an error, search by correlation ID first, then component and event. Do not copy private
payloads into an issue or chat while investigating.

## Health surfaces

- `GET /api/health` is a public no-store liveness route. It does not query Neon or reveal provider
  configuration.
- `/workspace/data-health` is authenticated and owner-scoped. It checks Neon connectivity and shows
  visible dataset freshness, model/feature versions, and the authorized user's draft-event recency.
- GitHub Actions status and uploaded structured reports remain the source of truth for scheduled job
  completion.

The Data Health page returns an unavailable state rather than exposing a database exception. A failed
check never mutates or removes the last valid dataset.

## Alerting baseline

For the personal release, configure notifications for:

- any scheduled job failure
- repeated `provider.failed` events
- stale/quarantined dataset status
- production function error-rate spikes
- database connection failures
- an in-progress draft with no recent provider events

Vercel runtime logs and GitHub Actions are the initial sinks. Keep the provider interface narrow so an
external log/alert service can be added later without changing domain modules.
