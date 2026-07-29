# Draft event engine

`@fantasyfb/draft-room` is the application-facing module for draft tracking. Its interface lets a
caller load reduced state, append one normalized event, or synchronize one event source. Provider
polling, repository envelopes, sequencing, idempotency, and replay stay inside the module.

## Append-only event model

Every normalized event has a stable event ID, draft ID, source, event type, received sequence and
timestamp. Pick-related events also carry overall pick, round, draft slot, fantasy team, canonical
or provider player identity, and keeper status. Mutations point to the event they change through
`correctionReference`; no event is updated or deleted.

Supported event types are:

- pick recorded, corrected, or removed
- draft paused, resumed, or completed
- keeper assigned
- pick traded
- player mapping resolved

The PostgreSQL adapter writes a versioned `fantasyfb-draft-event` envelope into the existing
`draft_events.payload` JSONB column through `DraftRepository`. Per-draft sequence and idempotency
constraints remain database-enforced. The authenticated
`/api/private/drafts/{draftId}/events` route reads reduced state with `GET` and appends a normalized
event with `POST`; ownership is checked before the repository reads or writes.

## Deterministic replay

`replayDraftEvents` validates and sorts history by persisted sequence and stable event ID. It then:

1. deduplicates repeated event delivery
2. resolves correction references from the complete log, including a correction received before
   its original pick
3. applies removal, trade, keeper, and mapping events
4. resolves conflicting overall picks predictably and reports warnings
5. derives draft status, the board, recent picks, team rosters, drafted canonical player IDs, and
   unresolved provider player IDs

The same event history therefore always produces the same state. Snapshots can be added later as a
cache, but the event log remains authoritative and any snapshot must be reproducible by replay.

## Sources and synchronization

- The Sleeper polling adapter reads the documented `GET /draft/{draft_id}/picks` endpoint. It emits
  normalized picks and corrections, ignores duplicate snapshots, rejects lagging snapshots as
  stale, and makes rate limiting and interruptions explicit.
- Manual entry produces validated manual events and remains independent from provider availability.
- The fixture source emits deterministic batches for tests and the public sample simulator.
- The versioned ESPN companion contract normalizes future trusted companion messages. It does not
  scrape ESPN, request cookies, or inspect browser sessions.

A synchronization attempt returns `live`, `stale`, `interrupted`, or `completed` status with a
human-readable detail and check time. An interruption leaves the last persisted replayed state
available.

## Interface

The authenticated workspace and the sample-only `/draft-demo` render the same draft board. The
sample route uses fictional in-memory events and never accesses private records. The interface
includes:

- a snake-order board and recent-pick feed
- derived team rosters and an available-player list
- fast manual selection with Enter, U for undo, and P for pause/resume
- targeted correction and undo controls
- fixture polling status and a stale-data state
- replay warnings when provider data conflicts or cannot be mapped

Real private draft events use the authenticated repository endpoint. The public simulator is an
interaction and layout fixture, not a fallback for provider or database failure.

## Verification

Module tests cover deterministic replay, out-of-order correction references, duplicate delivery,
undo, keepers, traded picks, missing mappings, mapping resolution, conflicting picks, fixture
synchronization, Sleeper correction/staleness behavior, interrupted providers, and the ESPN
companion contract. Web route tests cover authorization, private reads, and route-scoped appends.
