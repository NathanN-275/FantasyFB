import type { AuthorizationContext, DraftEventRecord, DraftRepository } from "@fantasyfb/contracts";
import { replayDraftEvents } from "./reducer.js";
import {
  newDraftEventSchema,
  type DraftEvent,
  type DraftEventSource,
  type DraftState,
  type DraftSynchronization
} from "./types.js";

const EVENT_FORMAT = "fantasyfb-draft-event";
const EVENT_VERSION = 1;

export class DraftRoomError extends Error {
  readonly code: "invalid-history" | "sequence-conflict";

  constructor(code: DraftRoomError["code"], message: string, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DraftRoomError";
    this.code = code;
  }
}

function recordToEvent(record: DraftEventRecord): DraftEvent {
  const envelope = record.payload as {
    readonly format?: unknown;
    readonly version?: unknown;
    readonly event?: unknown;
  };
  if (envelope.format !== EVENT_FORMAT || envelope.version !== EVENT_VERSION) {
    throw new DraftRoomError(
      "invalid-history",
      `Draft event ${record.id} does not use the supported event envelope.`
    );
  }
  const parsed = newDraftEventSchema.safeParse(envelope.event);
  if (!parsed.success) {
    throw new DraftRoomError("invalid-history", `Draft event ${record.id} is malformed.`);
  }
  return {
    ...parsed.data,
    sequence: record.sequence,
    receivedAt: record.receivedAt.toISOString()
  };
}

export interface DraftRoom {
  load(draftId: string): Promise<DraftState>;
  append(input: unknown): Promise<{ readonly event: DraftEvent; readonly state: DraftState }>;
  synchronize(
    draftId: string,
    source: DraftEventSource
  ): Promise<{ readonly state: DraftState; readonly synchronization: DraftSynchronization }>;
}

/**
 * The application-facing draft module. Callers append facts or poll a source;
 * persistence encoding, idempotency, sequencing, and replay remain behind this
 * small interface.
 */
export function createDraftRoom(dependencies: {
  readonly repository: DraftRepository;
  readonly authorization: AuthorizationContext;
  readonly now?: () => Date;
}): DraftRoom {
  const { repository, authorization } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  async function loadEvents(draftId: string) {
    const records = await repository.listEvents(authorization, draftId);
    return records.map(recordToEvent);
  }

  function isSequenceConflict(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const candidate = error as {
      readonly code?: unknown;
      readonly constraint?: unknown;
      readonly message?: unknown;
    };
    return (
      candidate.code === "23505" &&
      (candidate.constraint === "draft_events_draft_sequence_unique" ||
        (typeof candidate.message === "string" &&
          candidate.message.includes("draft_events_draft_sequence_unique")))
    );
  }

  async function append(input: unknown) {
    const candidate = newDraftEventSchema.parse(input);
    let record: DraftEventRecord | undefined;
    let lastConflict: unknown;
    for (let attempt = 0; attempt < 3 && !record; attempt += 1) {
      const history = await loadEvents(candidate.draftId);
      const sequence = Math.max(0, ...history.map((event) => event.sequence)) + 1;
      try {
        record = await repository.appendEvent(authorization, {
          draftId: candidate.draftId,
          sequence,
          eventType: candidate.eventType,
          idempotencyKey: candidate.eventId,
          payload: {
            format: EVENT_FORMAT,
            version: EVENT_VERSION,
            event: candidate
          },
          ...(candidate.providerEventId === undefined
            ? {}
            : { providerEventId: candidate.providerEventId }),
          ...(candidate.providerTimestamp === undefined
            ? {}
            : { providerTimestamp: new Date(candidate.providerTimestamp) })
        });
      } catch (error) {
        if (!isSequenceConflict(error)) throw error;
        lastConflict = error;
      }
    }
    if (!record) {
      throw new DraftRoomError(
        "sequence-conflict",
        "The draft changed repeatedly while this event was being appended; reload and retry.",
        { cause: lastConflict }
      );
    }
    const event = recordToEvent(record);
    const events = await loadEvents(candidate.draftId);
    return { event, state: replayDraftEvents(events, candidate.draftId) };
  }

  return {
    async load(draftId) {
      return replayDraftEvents(await loadEvents(draftId), draftId);
    },

    append,

    async synchronize(draftId, source) {
      let poll;
      try {
        const currentState = replayDraftEvents(await loadEvents(draftId), draftId);
        poll = await source.poll({ draftId, currentState });
      } catch (error) {
        const state = replayDraftEvents(await loadEvents(draftId), draftId);
        return {
          state,
          synchronization: {
            source: source.kind,
            state: "interrupted",
            checkedAt: now().toISOString(),
            detail:
              error instanceof Error ? error.message : "Draft synchronization was interrupted.",
            appendedEventCount: 0
          }
        };
      }

      let appendedEventCount = 0;
      for (const event of poll.events) {
        await append(event);
        appendedEventCount += 1;
      }
      return {
        state: replayDraftEvents(await loadEvents(draftId), draftId),
        synchronization: {
          source: source.kind,
          state: poll.state,
          checkedAt: poll.polledAt,
          detail: poll.detail,
          appendedEventCount
        }
      };
    }
  };
}

export { replayDraftEvents } from "./reducer.js";
export {
  createDraftRecommendationEngine,
  DRAFT_RECOMMENDATION_STRATEGIES,
  DraftRecommendationEngine,
  type DraftRecommendation,
  type DraftRecommendationInput,
  type DraftRecommendationPlayer,
  type DraftRecommendationPosition,
  type DraftRecommendationResult,
  type DraftRecommendationStrategy
} from "./recommendations.js";
export {
  createFixtureDraftSource,
  createManualDraftEvent,
  createSleeperPollingSource,
  DraftSourceError,
  type DraftSourceErrorCode
} from "./sources.js";
export {
  ESPN_COMPANION_CONTRACT_VERSION,
  ESPN_COMPANION_PICK_CONTRACT,
  ESPN_COMPANION_STATUS_CONTRACT,
  espnCompanionPickMessageSchema,
  espnCompanionStatusMessageSchema,
  evaluateEspnCompanionPickMessage,
  type EspnCompanionAcceptancePolicy,
  type EspnCompanionPickEvaluation,
  type EspnCompanionPickMessageV1,
  type EspnCompanionRejectionCode,
  type EspnCompanionStatusMessageV1
} from "./espn-companion.js";
export {
  DRAFT_EVENT_TYPES,
  DRAFT_SOURCES,
  draftEventSchema,
  newDraftEventSchema,
  type DraftEvent,
  type DraftEventSource,
  type DraftEventType,
  type DraftPick,
  type DraftRoster,
  type DraftSource,
  type DraftSourcePoll,
  type DraftState,
  type DraftSynchronization,
  type NewDraftEvent
} from "./types.js";
