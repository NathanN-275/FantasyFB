import {
  newDraftEventSchema,
  type DraftEventSource,
  type DraftSourcePoll,
  type NewDraftEvent
} from "./types.js";

type Fetch = typeof globalThis.fetch;

export type DraftSourceErrorCode = "invalid-response" | "provider-failure" | "rate-limited";

export class DraftSourceError extends Error {
  readonly code: DraftSourceErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    code: DraftSourceErrorCode,
    message: string,
    options?: { cause?: unknown; retryAfterSeconds?: number }
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DraftSourceError";
    this.code = code;
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export function createManualDraftEvent(input: unknown): NewDraftEvent {
  return newDraftEventSchema.parse({ ...(input as object), source: "manual" });
}

export function createFixtureDraftSource(
  fixtureEvents: readonly unknown[],
  dependencies: { readonly now?: () => Date; readonly batchSize?: number } = {}
): DraftEventSource {
  const events = fixtureEvents.map((event) =>
    newDraftEventSchema.parse({ ...(event as object), source: "fixture" })
  );
  const now = dependencies.now ?? (() => new Date());
  const batchSize = dependencies.batchSize ?? events.length;
  let cursor = 0;

  return {
    kind: "fixture",
    async poll() {
      const batch = events.slice(cursor, cursor + batchSize);
      cursor += batch.length;
      return {
        events: batch,
        polledAt: now().toISOString(),
        state: cursor >= events.length ? "completed" : "live",
        detail:
          cursor >= events.length
            ? "Fixture simulation reached the end of its event stream."
            : "Fixture simulation has more events available."
      };
    }
  };
}

interface SleeperPick {
  readonly draft_id: string;
  readonly pick_no: number;
  readonly round: number;
  readonly draft_slot: number;
  readonly roster_id: number;
  readonly player_id: string;
  readonly is_keeper?: boolean | null;
}

function parseSleeperPicks(value: unknown): SleeperPick[] {
  if (!Array.isArray(value)) {
    throw new DraftSourceError("invalid-response", "Sleeper returned a non-list draft response.");
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new DraftSourceError(
        "invalid-response",
        `Sleeper pick ${index + 1} was not an object.`
      );
    }
    const pick = item as Record<string, unknown>;
    for (const field of ["draft_id", "player_id"] as const) {
      if (typeof pick[field] !== "string" || pick[field].length === 0) {
        throw new DraftSourceError(
          "invalid-response",
          `Sleeper pick ${index + 1} is missing ${field}.`
        );
      }
    }
    for (const field of ["pick_no", "round", "draft_slot", "roster_id"] as const) {
      if (!Number.isInteger(pick[field]) || Number(pick[field]) <= 0) {
        throw new DraftSourceError(
          "invalid-response",
          `Sleeper pick ${index + 1} has invalid ${field}.`
        );
      }
    }
    return pick as unknown as SleeperPick;
  });
}

export function createSleeperPollingSource(
  providerDraftId: string,
  dependencies: {
    readonly fetch?: Fetch;
    readonly baseUrl?: string;
    readonly now?: () => Date;
  } = {}
): DraftEventSource {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const baseUrl = (dependencies.baseUrl ?? "https://api.sleeper.app/v1").replace(/\/$/, "");
  const now = dependencies.now ?? (() => new Date());
  const previousByOverallPick = new Map<number, NewDraftEvent>();
  let highestObservedPick = 0;

  return {
    kind: "sleeper",
    async poll({ draftId }): Promise<DraftSourcePoll> {
      let response: Response;
      try {
        response = await fetchImplementation(
          `${baseUrl}/draft/${encodeURIComponent(providerDraftId)}/picks`,
          { method: "GET", headers: { accept: "application/json" } }
        );
      } catch (error) {
        throw new DraftSourceError("provider-failure", "Sleeper draft polling was interrupted.", {
          cause: error
        });
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        throw new DraftSourceError("rate-limited", "Sleeper rate limited draft polling.", {
          ...(Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {})
        });
      }
      if (!response.ok) {
        throw new DraftSourceError(
          "provider-failure",
          `Sleeper draft polling failed with HTTP ${response.status}.`
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new DraftSourceError(
          "invalid-response",
          "Sleeper draft polling returned malformed JSON.",
          { cause: error }
        );
      }
      const picks = parseSleeperPicks(payload).sort((left, right) => left.pick_no - right.pick_no);
      const observedHighest = picks.at(-1)?.pick_no ?? 0;
      const polledAt = now().toISOString();
      if (observedHighest < highestObservedPick) {
        return {
          events: [],
          polledAt,
          state: "stale",
          detail: `Sleeper returned picks through ${observedHighest}, behind observed pick ${highestObservedPick}; no events were appended.`
        };
      }

      const events: NewDraftEvent[] = [];
      for (const pick of picks) {
        const previous = previousByOverallPick.get(pick.pick_no);
        const identity = `${pick.player_id}:${pick.roster_id}:${pick.draft_slot}`;
        const previousIdentity = previous
          ? `${previous.playerExternalId}:${previous.fantasyTeamId}:${previous.draftSlot}`
          : undefined;
        if (identity === previousIdentity) continue;

        const eventId = `sleeper:${providerDraftId}:pick:${pick.pick_no}:${identity}`;
        const event = newDraftEventSchema.parse({
          eventId,
          draftId,
          source: "sleeper",
          eventType: previous
            ? "pick_corrected"
            : pick.is_keeper
              ? "keeper_assigned"
              : "pick_recorded",
          overallPick: pick.pick_no,
          round: pick.round,
          draftSlot: pick.draft_slot,
          fantasyTeamId: `sleeper-roster:${pick.roster_id}`,
          playerExternalId: pick.player_id,
          keeperStatus: pick.is_keeper ? "keeper" : "standard",
          providerEventId: `${providerDraftId}:${pick.pick_no}`,
          providerTimestamp: polledAt,
          ...(previous ? { correctionReference: previous.eventId } : {})
        });
        previousByOverallPick.set(pick.pick_no, event);
        events.push(event);
      }
      highestObservedPick = Math.max(highestObservedPick, observedHighest);
      return {
        events,
        polledAt,
        state: "live",
        detail:
          events.length === 0
            ? "Sleeper is connected; no new draft events were found."
            : `Sleeper returned ${events.length} new or corrected draft event${events.length === 1 ? "" : "s"}.`
      };
    }
  };
}
