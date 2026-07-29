import { z } from "zod";

export const DRAFT_EVENT_TYPES = [
  "pick_recorded",
  "pick_corrected",
  "pick_removed",
  "draft_paused",
  "draft_resumed",
  "draft_completed",
  "keeper_assigned",
  "pick_traded",
  "player_mapping_resolved"
] as const;

export const DRAFT_SOURCES = ["sleeper", "manual", "fixture", "espn_companion"] as const;

const identifier = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();

const draftEventObjectSchema = z
  .object({
    eventId: identifier,
    draftId: identifier,
    source: z.enum(DRAFT_SOURCES),
    sequence: positiveInteger,
    eventType: z.enum(DRAFT_EVENT_TYPES),
    overallPick: positiveInteger.optional(),
    round: positiveInteger.optional(),
    draftSlot: positiveInteger.optional(),
    fantasyTeamId: identifier.optional(),
    playerId: identifier.optional(),
    playerExternalId: identifier.optional(),
    keeperStatus: z.enum(["standard", "keeper"]).optional(),
    providerEventId: identifier.optional(),
    providerTimestamp: z.string().datetime({ offset: true }).optional(),
    receivedAt: z.string().datetime({ offset: true }),
    correctionReference: identifier.optional()
  })
  .strict();

function validateEvent(
  event: Omit<z.infer<typeof draftEventObjectSchema>, "sequence" | "receivedAt">,
  context: z.RefinementCtx
) {
  const requirePickCoordinates = () => {
    for (const field of ["overallPick", "round", "draftSlot", "fantasyTeamId"] as const) {
      if (event[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required for a pick event.`
        });
      }
    }
    if (!event.playerId && !event.playerExternalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playerId"],
        message: "A canonical or provider player identifier is required for a pick event."
      });
    }
  };

  if (event.eventType === "pick_recorded" || event.eventType === "keeper_assigned") {
    requirePickCoordinates();
  }
  if (event.eventType === "keeper_assigned" && event.keeperStatus !== "keeper") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["keeperStatus"],
      message: "Keeper events must have keeper status."
    });
  }
  if (
    ["pick_corrected", "pick_removed", "pick_traded"].includes(event.eventType) &&
    !event.correctionReference
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["correctionReference"],
      message: `${event.eventType} must reference the event it changes.`
    });
  }
  if (event.eventType === "pick_traded" && !event.fantasyTeamId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fantasyTeamId"],
      message: "A traded pick must identify its new fantasy team."
    });
  }
  if (
    event.eventType === "player_mapping_resolved" &&
    (!event.playerId || !event.playerExternalId)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["playerId"],
      message: "A mapping event requires provider and canonical player identifiers."
    });
  }
}

export const draftEventSchema = draftEventObjectSchema.superRefine(validateEvent);

export const newDraftEventSchema = draftEventObjectSchema
  .omit({
    sequence: true,
    receivedAt: true
  })
  .superRefine(validateEvent);

export type DraftEvent = z.infer<typeof draftEventSchema>;
export type NewDraftEvent = z.infer<typeof newDraftEventSchema>;
export type DraftEventType = (typeof DRAFT_EVENT_TYPES)[number];
export type DraftSource = (typeof DRAFT_SOURCES)[number];

export interface DraftPick {
  readonly eventId: string;
  readonly source: DraftSource;
  readonly sequence: number;
  readonly overallPick: number;
  readonly round: number;
  readonly draftSlot: number;
  readonly fantasyTeamId: string;
  readonly playerId?: string;
  readonly playerExternalId?: string;
  readonly keeperStatus: "standard" | "keeper";
  readonly providerTimestamp?: string;
}

export interface DraftRoster {
  readonly fantasyTeamId: string;
  readonly picks: readonly DraftPick[];
}

export interface DraftState {
  readonly draftId: string;
  readonly status: "scheduled" | "in_progress" | "paused" | "completed";
  readonly picks: readonly DraftPick[];
  readonly recentPicks: readonly DraftPick[];
  readonly rosters: readonly DraftRoster[];
  readonly draftedPlayerIds: readonly string[];
  readonly unresolvedPlayerExternalIds: readonly string[];
  readonly eventCount: number;
  readonly lastSequence: number;
  readonly warnings: readonly string[];
}

export interface DraftSourcePoll {
  readonly events: readonly NewDraftEvent[];
  readonly polledAt: string;
  readonly state: "live" | "stale" | "completed";
  readonly detail: string;
}

export interface DraftEventSource {
  readonly kind: DraftSource;
  poll(input: {
    readonly draftId: string;
    readonly currentState: DraftState;
  }): Promise<DraftSourcePoll>;
}

export interface DraftSynchronization {
  readonly source: DraftSource;
  readonly state: "live" | "stale" | "interrupted" | "completed";
  readonly checkedAt: string;
  readonly detail: string;
  readonly appendedEventCount: number;
}
