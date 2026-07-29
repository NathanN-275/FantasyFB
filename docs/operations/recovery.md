# Recovery runbook

Recovery actions are owner-operated. Record the incident time, affected environment, last known good
dataset/deployment/migration, and a correlation ID before changing state. Never test recovery against
the only production branch.

## Restore the database

1. Disable scheduled write jobs and pause production mutations.
2. Record the suspected bad operation time and current migration journal.
3. In Neon, use Time Travel/restore inspection to choose a point before the incident.
4. Restore to a new branch first. Do not overwrite production before validation.
5. Connect with the direct URL and run:

   ```bash
   pnpm db:migrations:check
   pnpm db:validate
   ```

6. Inspect owner counts, latest dataset versions, draft-event sequences, and private/public visibility.
7. Point a private Vercel preview at the restored branch and complete the release checklist.
8. Promote/switch only after validation; rotate the production direct and pooled credentials if they
   may have been exposed.
9. Re-enable scheduled jobs one at a time and confirm last-valid preservation.

Neon instant restore is bounded by the configured restore window. For long-term or provider-independent
recovery, create encrypted logical backups with direct connections and test `pg_restore` into an empty
branch. Never run `pg_dump` with the pooled URL.

## Reprocess historical data

Historical ingestion is idempotent by dataset/version inputs and preserves the last valid dataset on a
failed provider run.

```bash
DATABASE_URL="<pooled recovery branch URL>" \
  python pipelines/historical-data/run_ingestion.py --seasons 2024 2025
```

Run it against a recovery/preview branch first. Review the structured report, unresolved identities,
record counts, validation status, and weekly/season aggregate counts before production.

## Rebuild projections

Choose a validated historical dataset UUID and explicit scoring configuration. Do not silently replace
it with the most recent row.

```bash
DATABASE_URL="<pooled recovery branch URL>" \
  python pipelines/projections/run_projection.py \
  --target-season 2026 \
  --dataset-version-id "<validated dataset UUID>" \
  --scoring-config pipelines/projections/fixtures/full-ppr.json
```

The fixture path above is an example only; production must use the intended versioned scoring
configuration. Compare model version, feature version, training range, count, and calibration metrics
with the previous successful run before promoting rankings derived from it.

## Recover draft state

Draft state is derived, not repaired by mutating roster tables.

1. Export the draft's ordered `draft_events` rows from a restored/production read-only connection.
2. Verify unique sequence and idempotency keys.
3. Run the deterministic draft-room replay tests:

   ```bash
   pnpm --filter @fantasyfb/draft-room test
   ```

4. Load the draft through the authorized workspace. The server rebuilds state by reducing the append-only
   history.
5. If an event is incorrect, append a supported correction/removal event. Do not edit an earlier event.
6. Resume Sleeper polling only after the replayed pick count and roster allocation match the provider.

## Disable a failing provider

- News: remove the affected source from `NEWS_SOURCES_JSON` and redeploy/re-run; keep other reviewed
  sources enabled.
- Expert API: clear its optional endpoint/token pair and redeploy. The UI will hide Expert Rank and
  explain unavailability.
- ADP: disable the scheduled ADP workflow or remove the affected context from `ADP_CONTEXTS_JSON`.
- Historical data: disable the scheduled historical workflow while retaining persisted datasets.
- Sleeper draft: stop polling and use manual entry; append no guessed picks.
- ESPN companion: it remains disabled by default; use the emergency disable control if experimental
  work is ever enabled.

Provider failure must never delete the last valid dataset or fabricate replacement data.

## Rotate credentials

1. Create the replacement credential at the provider.
2. Update the correct Vercel/GitHub environment only; Preview and Production credentials stay separate.
3. Redeploy or rerun the job and verify with a health check.
4. Revoke the old credential.
5. For `AUTH_SECRET`, expect existing sessions to be invalidated and verify sign-in again.
6. For Neon roles, rotate pooled and direct URLs independently and inspect active connections.
7. Search logs and Git history for exposure; if committed, treat history rewrite as a separate,
   explicitly approved incident action.

## Remove a private import

Use an owner-scoped application/admin operation after creating a backup. Preview the exact import ID,
owner ID, derived dataset versions, projection/ranking runs, and row counts. Remove derived private
records and the import inside one transaction; do not delete public datasets or another owner's rows.
The current personal release does not expose this destructive action in the browser.

After deletion, verify that public responses are unchanged, the owner no longer sees the import or
derived runs, and no object-storage original remains. If the original file was preserved outside
normalized records, delete it through the configured `StorageProvider`.

## Recreate public demo fixtures

Public demo pages import synthetic repository fixtures; they do not copy production data.

```bash
pnpm test
pnpm build
pnpm test:e2e
```

If fixtures are regenerated, review every provenance label and public response test before deployment.
Never export a production/private row as a shortcut for demo data.
