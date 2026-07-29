import type { AuthorizationContext, DraftEventRecord, DraftRepository } from "@fantasyfb/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createDraftRoom,
  createFixtureDraftSource,
  createSleeperPollingSource,
  normalizeEspnCompanionEvent,
  replayDraftEvents,
  type DraftEvent
} from "./index.js";

const draftId = "draft-1";
const receivedAt = "2026-07-25T16:00:00.000Z";

function event(
  input: Partial<DraftEvent> & Pick<DraftEvent, "eventId" | "eventType" | "sequence">
): DraftEvent {
  return {
    draftId,
    source: "manual",
    receivedAt,
    ...input
  } as DraftEvent;
}

function pick(input: Partial<DraftEvent> & Pick<DraftEvent, "eventId" | "sequence">): DraftEvent {
  return event({
    eventType: "pick_recorded",
    overallPick: 1,
    round: 1,
    draftSlot: 1,
    fantasyTeamId: "team-1",
    playerId: "player-1",
    keeperStatus: "standard",
    ...input
  });
}

function inMemoryRepository(): DraftRepository & { readonly records: DraftEventRecord[] } {
  const records: DraftEventRecord[] = [];
  return {
    records,
    async listEvents(_context, requestedDraftId) {
      return records
        .filter((record) => record.draftId === requestedDraftId)
        .sort((left, right) => left.sequence - right.sequence);
    },
    async appendEvent(_context, input) {
      const existing = records.find(
        (record) =>
          record.draftId === input.draftId && record.idempotencyKey === input.idempotencyKey
      );
      if (existing) return existing;
      const record: DraftEventRecord = {
        ...input,
        id: `record-${records.length + 1}`,
        receivedAt: new Date("2026-07-25T16:00:00.000Z")
      };
      records.push(record);
      return record;
    }
  };
}

describe("draft event replay", () => {
  it("preserves the requested draft identity before its first event", () => {
    expect(replayDraftEvents([], "empty-draft")).toMatchObject({
      draftId: "empty-draft",
      status: "scheduled",
      eventCount: 0
    });
  });

  it("deterministically handles out-of-order corrections, keepers, trades, undo, and mappings", () => {
    const history = [
      event({
        eventId: "correction",
        sequence: 2,
        eventType: "pick_corrected",
        correctionReference: "original",
        playerExternalId: "provider-player-2"
      }),
      event({
        eventId: "trade",
        sequence: 3,
        eventType: "pick_traded",
        correctionReference: "correction",
        fantasyTeamId: "team-2"
      }),
      event({
        eventId: "mapping",
        sequence: 4,
        eventType: "player_mapping_resolved",
        playerExternalId: "provider-player-2",
        playerId: "player-2"
      }),
      pick({ eventId: "original", sequence: 5 }),
      event({
        eventId: "keeper",
        sequence: 6,
        eventType: "keeper_assigned",
        overallPick: 2,
        round: 1,
        draftSlot: 2,
        fantasyTeamId: "team-3",
        playerId: "player-3",
        keeperStatus: "keeper"
      }),
      event({
        eventId: "undo-keeper",
        sequence: 7,
        eventType: "pick_removed",
        correctionReference: "keeper"
      }),
      event({ eventId: "pause", sequence: 8, eventType: "draft_paused" }),
      event({ eventId: "resume", sequence: 9, eventType: "draft_resumed" }),
      event({ eventId: "complete", sequence: 10, eventType: "draft_completed" }),
      event({ eventId: "complete", sequence: 11, eventType: "draft_completed" })
    ];

    const firstReplay = replayDraftEvents(history);
    const secondReplay = replayDraftEvents(structuredClone(history));

    expect(secondReplay).toEqual(firstReplay);
    expect(firstReplay).toMatchObject({
      draftId,
      status: "completed",
      picks: [
        {
          eventId: "correction",
          overallPick: 1,
          fantasyTeamId: "team-2",
          playerId: "player-2",
          playerExternalId: "provider-player-2"
        }
      ],
      draftedPlayerIds: ["player-2"],
      unresolvedPlayerExternalIds: [],
      eventCount: 9,
      lastSequence: 10
    });
    expect(firstReplay.warnings).toContain("Duplicate event complete was ignored.");
  });

  it("keeps missing mappings explicit and resolves duplicate overall picks predictably", () => {
    const state = replayDraftEvents([
      pick({
        eventId: "provider-pick",
        sequence: 1,
        playerId: undefined,
        playerExternalId: "missing-44"
      }),
      pick({
        eventId: "later-pick",
        sequence: 2,
        playerId: "player-2",
        overallPick: 1
      })
    ]);

    expect(state.picks).toHaveLength(1);
    expect(state.picks[0]?.eventId).toBe("later-pick");
    expect(state.warnings).toContain("Conflicting overall pick 1 used the last event.");
  });
});

describe("DraftRoom persistence and source synchronization", () => {
  const authorization: AuthorizationContext = { userId: "user-1" };

  it("persists append-only envelopes and makes duplicate provider delivery idempotent", async () => {
    const repository = inMemoryRepository();
    const room = createDraftRoom({ repository, authorization });
    const input = {
      eventId: "manual-1",
      draftId,
      source: "manual" as const,
      eventType: "pick_recorded" as const,
      overallPick: 1,
      round: 1,
      draftSlot: 1,
      fantasyTeamId: "team-1",
      playerId: "player-1",
      keeperStatus: "standard" as const
    };

    await room.append(input);
    const duplicate = await room.append(input);

    expect(repository.records).toHaveLength(1);
    expect(repository.records[0]?.payload).toMatchObject({
      format: "fantasyfb-draft-event",
      version: 1,
      event: input
    });
    expect(duplicate.state.picks).toHaveLength(1);
  });

  it("reloads sequence state and retries a concurrent append conflict", async () => {
    const persisted = inMemoryRepository();
    let attempts = 0;
    const repository: DraftRepository = {
      listEvents: persisted.listEvents,
      async appendEvent(context, input) {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("duplicate key"), {
            code: "23505",
            constraint: "draft_events_draft_sequence_unique"
          });
        }
        return persisted.appendEvent(context, input);
      }
    };
    const room = createDraftRoom({ repository, authorization });

    const result = await room.append({
      eventId: "manual-retry",
      draftId,
      source: "manual",
      eventType: "draft_paused"
    });

    expect(attempts).toBe(2);
    expect(result.state).toMatchObject({ draftId, status: "paused", eventCount: 1 });
  });

  it("synchronizes fixture batches and reports provider interruptions without losing state", async () => {
    const repository = inMemoryRepository();
    const room = createDraftRoom({ repository, authorization });
    const source = createFixtureDraftSource(
      [
        {
          eventId: "fixture-1",
          draftId,
          eventType: "pick_recorded",
          overallPick: 1,
          round: 1,
          draftSlot: 1,
          fantasyTeamId: "team-1",
          playerId: "player-1",
          keeperStatus: "standard"
        }
      ],
      { now: () => new Date(receivedAt) }
    );

    const synchronized = await room.synchronize(draftId, source);
    const interrupted = await room.synchronize(draftId, {
      kind: "sleeper",
      poll: vi.fn().mockRejectedValue(new Error("Provider offline"))
    });

    expect(synchronized.synchronization).toMatchObject({
      state: "completed",
      appendedEventCount: 1
    });
    expect(interrupted.synchronization).toMatchObject({
      state: "interrupted",
      appendedEventCount: 0,
      detail: "Provider offline"
    });
    expect(interrupted.state).toEqual(synchronized.state);
  });
});

describe("draft source adapters", () => {
  it("polls Sleeper picks, emits corrections, and rejects stale provider responses", async () => {
    const responses = [
      [
        {
          draft_id: "provider-draft",
          pick_no: 1,
          round: 1,
          draft_slot: 1,
          roster_id: 10,
          player_id: "external-1"
        }
      ],
      [
        {
          draft_id: "provider-draft",
          pick_no: 1,
          round: 1,
          draft_slot: 1,
          roster_id: 10,
          player_id: "external-2"
        }
      ],
      []
    ];
    const fetch = vi.fn(async () => Response.json(responses.shift()));
    const source = createSleeperPollingSource("provider-draft", {
      fetch,
      now: () => new Date(receivedAt)
    });
    const currentState = replayDraftEvents([]);

    const first = await source.poll({ draftId, currentState });
    const corrected = await source.poll({ draftId, currentState });
    const stale = await source.poll({ draftId, currentState });

    expect(first.events[0]).toMatchObject({
      eventType: "pick_recorded",
      playerExternalId: "external-1"
    });
    expect(corrected.events[0]).toMatchObject({
      eventType: "pick_corrected",
      playerExternalId: "external-2",
      correctionReference: first.events[0]?.eventId
    });
    expect(stale).toMatchObject({ state: "stale", events: [] });
  });

  it("defines a versioned future ESPN companion contract without scraping", () => {
    expect(
      normalizeEspnCompanionEvent({
        version: 1,
        eventId: "espn-event-1",
        draftId,
        eventType: "pick_recorded",
        overallPick: 1,
        round: 1,
        draftSlot: 1,
        fantasyTeamId: "team-1",
        playerExternalId: "espn-player-1",
        keeperStatus: "standard",
        occurredAt: receivedAt
      })
    ).toMatchObject({
      source: "espn_companion",
      providerTimestamp: receivedAt
    });
  });
});
