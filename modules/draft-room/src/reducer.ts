import { draftEventSchema, type DraftEvent, type DraftPick, type DraftState } from "./types.js";

const PICK_EVENT_TYPES = new Set(["pick_recorded", "keeper_assigned", "pick_corrected"]);

function compareEvents(left: DraftEvent, right: DraftEvent) {
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
}

function emptyState(draftId: string, warnings: readonly string[] = []): DraftState {
  return {
    draftId,
    status: "scheduled",
    picks: [],
    recentPicks: [],
    rosters: [],
    draftedPlayerIds: [],
    unresolvedPlayerExternalIds: [],
    eventCount: 0,
    lastSequence: 0,
    warnings
  };
}

function pickFromEvent(
  event: DraftEvent,
  eventsById: ReadonlyMap<string, DraftEvent>,
  resolving = new Set<string>()
): DraftPick | undefined {
  type MutableDraftPick = { -readonly [Key in keyof DraftPick]: DraftPick[Key] };
  type WorkingPick = Partial<MutableDraftPick> &
    Pick<MutableDraftPick, "eventId" | "source" | "sequence" | "keeperStatus">;

  if (resolving.has(event.eventId)) return undefined;
  resolving.add(event.eventId);

  let base: Partial<DraftPick> = {};
  if (event.eventType === "pick_corrected" && event.correctionReference) {
    const referenced = eventsById.get(event.correctionReference);
    if (referenced) base = pickFromEvent(referenced, eventsById, resolving) ?? {};
  }

  const result: WorkingPick = {
    ...base,
    eventId: event.eventId,
    source: event.source,
    sequence: event.sequence,
    ...(event.overallPick === undefined ? {} : { overallPick: event.overallPick }),
    ...(event.round === undefined ? {} : { round: event.round }),
    ...(event.draftSlot === undefined ? {} : { draftSlot: event.draftSlot }),
    ...(event.fantasyTeamId === undefined ? {} : { fantasyTeamId: event.fantasyTeamId }),
    ...(event.playerId === undefined ? {} : { playerId: event.playerId }),
    ...(event.playerExternalId === undefined ? {} : { playerExternalId: event.playerExternalId }),
    keeperStatus:
      event.keeperStatus ?? (event.eventType === "keeper_assigned" ? "keeper" : "standard"),
    ...(event.providerTimestamp === undefined ? {} : { providerTimestamp: event.providerTimestamp })
  };
  if (
    event.eventType === "pick_corrected" &&
    event.playerExternalId !== undefined &&
    event.playerId === undefined
  ) {
    delete result.playerId;
  }

  resolving.delete(event.eventId);
  if (
    result.overallPick === undefined ||
    result.round === undefined ||
    result.draftSlot === undefined ||
    result.fantasyTeamId === undefined ||
    (!result.playerId && !result.playerExternalId)
  ) {
    return undefined;
  }
  return result as DraftPick;
}

/**
 * Derives current draft state exclusively from immutable history. References are
 * resolved from the complete log, so a correction may be received before the pick
 * it changes without making replay order-dependent.
 */
export function replayDraftEvents(history: readonly unknown[], expectedDraftId = ""): DraftState {
  if (history.length === 0) return emptyState(expectedDraftId);

  const warnings: string[] = [];
  const parsed: DraftEvent[] = [];
  for (const candidate of history) {
    const result = draftEventSchema.safeParse(candidate);
    if (result.success) parsed.push(result.data);
    else warnings.push("An invalid draft event was ignored during replay.");
  }
  if (parsed.length === 0) return emptyState(expectedDraftId, warnings);

  parsed.sort(compareEvents);
  const draftId = expectedDraftId || parsed[0]?.draftId || "";
  const oneDraft = parsed.filter((event) => {
    if (event.draftId === draftId) return true;
    warnings.push(`Event ${event.eventId} belongs to a different draft and was ignored.`);
    return false;
  });

  const eventsById = new Map<string, DraftEvent>();
  for (const event of oneDraft) {
    if (eventsById.has(event.eventId)) {
      warnings.push(`Duplicate event ${event.eventId} was ignored.`);
      continue;
    }
    eventsById.set(event.eventId, event);
  }
  const events = [...eventsById.values()].sort(compareEvents);

  let status: DraftState["status"] = "scheduled";
  for (const event of events) {
    if (PICK_EVENT_TYPES.has(event.eventType) && status === "scheduled") status = "in_progress";
    if (event.eventType === "draft_paused" && status !== "completed") status = "paused";
    if (event.eventType === "draft_resumed" && status !== "completed") status = "in_progress";
    if (event.eventType === "draft_completed") status = "completed";
  }

  const inactive = new Set<string>();
  for (const event of events) {
    if (
      (event.eventType === "pick_corrected" || event.eventType === "pick_removed") &&
      event.correctionReference
    ) {
      inactive.add(event.correctionReference);
      if (!eventsById.has(event.correctionReference)) {
        warnings.push(
          `Event ${event.eventId} references missing event ${event.correctionReference}.`
        );
      }
    }
  }

  const mappingByExternalId = new Map<string, string>();
  for (const event of events) {
    if (event.eventType === "player_mapping_resolved" && event.playerExternalId && event.playerId) {
      mappingByExternalId.set(event.playerExternalId, event.playerId);
    }
  }

  const tradesByEventId = new Map<string, DraftEvent[]>();
  for (const event of events) {
    if (event.eventType !== "pick_traded" || !event.correctionReference) continue;
    const existing = tradesByEventId.get(event.correctionReference) ?? [];
    existing.push(event);
    tradesByEventId.set(event.correctionReference, existing);
  }

  const candidates: DraftPick[] = [];
  for (const event of events) {
    if (!PICK_EVENT_TYPES.has(event.eventType) || inactive.has(event.eventId)) continue;
    let pick = pickFromEvent(event, eventsById);
    if (!pick) {
      warnings.push(`Pick event ${event.eventId} did not resolve to a complete pick.`);
      continue;
    }
    const trades = tradesByEventId.get(event.eventId)?.sort(compareEvents) ?? [];
    const latestTrade = trades.at(-1);
    if (latestTrade?.fantasyTeamId) {
      pick = { ...pick, fantasyTeamId: latestTrade.fantasyTeamId };
    }
    if (!pick.playerId && pick.playerExternalId) {
      const mappedPlayerId = mappingByExternalId.get(pick.playerExternalId);
      if (mappedPlayerId) pick = { ...pick, playerId: mappedPlayerId };
    }
    candidates.push(pick);
  }

  const byOverallPick = new Map<number, DraftPick>();
  for (const pick of candidates.sort(
    (left, right) => left.overallPick - right.overallPick || left.sequence - right.sequence
  )) {
    const existing = byOverallPick.get(pick.overallPick);
    if (!existing || compareEvents(pick as DraftEvent, existing as DraftEvent) > 0) {
      if (existing)
        warnings.push(`Conflicting overall pick ${pick.overallPick} used the last event.`);
      byOverallPick.set(pick.overallPick, pick);
    } else {
      warnings.push(`Conflicting overall pick ${pick.overallPick} was ignored.`);
    }
  }

  const seenPlayerIds = new Set<string>();
  const picks: DraftPick[] = [];
  for (const pick of [...byOverallPick.values()].sort(
    (left, right) => left.overallPick - right.overallPick
  )) {
    if (pick.playerId && seenPlayerIds.has(pick.playerId)) {
      warnings.push(`Player ${pick.playerId} appeared in more than one active pick.`);
      continue;
    }
    if (pick.playerId) seenPlayerIds.add(pick.playerId);
    picks.push(pick);
  }

  const rosterMap = new Map<string, DraftPick[]>();
  for (const pick of picks) {
    const roster = rosterMap.get(pick.fantasyTeamId) ?? [];
    roster.push(pick);
    rosterMap.set(pick.fantasyTeamId, roster);
  }

  return {
    draftId,
    status,
    picks,
    recentPicks: [...picks].sort((left, right) => right.sequence - left.sequence).slice(0, 8),
    rosters: [...rosterMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fantasyTeamId, rosterPicks]) => ({ fantasyTeamId, picks: rosterPicks })),
    draftedPlayerIds: [...seenPlayerIds].sort(),
    unresolvedPlayerExternalIds: [
      ...new Set(
        picks
          .filter((pick) => !pick.playerId && pick.playerExternalId)
          .map((pick) => pick.playerExternalId as string)
      )
    ].sort(),
    eventCount: events.length,
    lastSequence: events.at(-1)?.sequence ?? 0,
    warnings
  };
}
