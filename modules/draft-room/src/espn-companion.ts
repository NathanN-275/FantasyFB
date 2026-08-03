import { z } from "zod";
import { newDraftEventSchema, type NewDraftEvent } from "./types.js";

export const ESPN_COMPANION_PICK_CONTRACT = "fantasyfb.espn-companion.pick";
export const ESPN_COMPANION_STATUS_CONTRACT = "fantasyfb.espn-companion.status";
export const ESPN_COMPANION_CONTRACT_VERSION = 1;

const identifier = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const semanticVersion = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Expected a semantic version.");

const resolvedPlayerSchema = z.discriminatedUnion("resolution", [
  z
    .object({
      resolution: z.literal("provider_id"),
      displayName: z.string().trim().min(1).max(120),
      espnPlayerId: identifier,
      canonicalPlayerId: identifier.optional()
    })
    .strict(),
  z
    .object({
      resolution: z.literal("exact_name"),
      displayName: z.string().trim().min(1).max(120),
      canonicalPlayerId: identifier,
      espnPlayerId: identifier.optional()
    })
    .strict(),
  z
    .object({
      resolution: z.literal("manual_confirmation"),
      displayName: z.string().trim().min(1).max(120),
      canonicalPlayerId: identifier,
      espnPlayerId: identifier.optional(),
      confirmedByUser: z.literal(true),
      confirmedAt: timestamp
    })
    .strict(),
  z
    .object({
      resolution: z.literal("uncertain"),
      displayName: z.string().trim().min(1).max(120),
      candidateCanonicalPlayerIds: z.array(identifier).max(10)
    })
    .strict()
]);

const pickCoordinates = {
  providerEventId: identifier,
  overallPick: z.number().int().positive(),
  round: z.number().int().positive(),
  draftSlot: z.number().int().positive(),
  fantasyTeamId: identifier,
  keeperStatus: z.enum(["standard", "keeper"]),
  player: resolvedPlayerSchema
} as const;

const observedPickEventSchema = z.discriminatedUnion("eventType", [
  z.object({ eventType: z.literal("pick_recorded"), ...pickCoordinates }).strict(),
  z
    .object({
      eventType: z.literal("pick_corrected"),
      ...pickCoordinates,
      correctionReference: identifier
    })
    .strict(),
  z
    .object({
      eventType: z.literal("pick_removed"),
      providerEventId: identifier,
      correctionReference: identifier
    })
    .strict()
]);

export const espnCompanionPickMessageSchema = z
  .object({
    contract: z.literal(ESPN_COMPANION_PICK_CONTRACT),
    contractVersion: z.literal(ESPN_COMPANION_CONTRACT_VERSION),
    messageId: identifier,
    companionVersion: semanticVersion,
    observerVersion: identifier,
    draftId: identifier,
    observedAt: timestamp,
    event: observedPickEventSchema
  })
  .strict();

export const espnCompanionStatusMessageSchema = z
  .object({
    contract: z.literal(ESPN_COMPANION_STATUS_CONTRACT),
    contractVersion: z.literal(ESPN_COMPANION_CONTRACT_VERSION),
    messageId: identifier,
    companionVersion: semanticVersion,
    observerVersion: identifier,
    draftId: identifier,
    occurredAt: timestamp,
    state: z.enum(["connecting", "live", "unsupported", "disabled", "disconnected"]),
    reason: z.enum([
      "pairing_started",
      "draft_detected",
      "page_signature_unknown",
      "observer_error",
      "user_disabled",
      "server_disabled",
      "pairing_expired",
      "network_unavailable"
    ])
  })
  .strict();

export type EspnCompanionPickMessageV1 = z.infer<typeof espnCompanionPickMessageSchema>;
export type EspnCompanionStatusMessageV1 = z.infer<typeof espnCompanionStatusMessageSchema>;

export type EspnCompanionRejectionCode =
  | "disabled"
  | "draft_mismatch"
  | "incompatible_contract"
  | "incompatible_observer"
  | "invalid_message";

export type EspnCompanionPickEvaluation =
  | { readonly status: "accepted"; readonly event: NewDraftEvent }
  | {
      readonly status: "confirmation_required";
      readonly messageId: string;
      readonly displayName: string;
      readonly candidateCanonicalPlayerIds: readonly string[];
    }
  | { readonly status: "duplicate"; readonly messageId: string }
  | {
      readonly status: "rejected";
      readonly code: EspnCompanionRejectionCode;
      readonly detail: string;
    };

export interface EspnCompanionAcceptancePolicy {
  readonly enabled: boolean;
  readonly expectedDraftId: string;
  readonly supportedObserverVersions: ReadonlySet<string>;
  readonly seenMessageIds?: ReadonlySet<string>;
}

/**
 * Validates a structured companion message at the DraftRoom boundary.
 *
 * This function accepts no DOM, browser, cookie, or credential input. A transport must authenticate
 * the user and bind the pairing session to expectedDraftId before calling it.
 */
export function evaluateEspnCompanionPickMessage(
  input: unknown,
  policy: EspnCompanionAcceptancePolicy
): EspnCompanionPickEvaluation {
  if (!policy.enabled) {
    return {
      status: "rejected",
      code: "disabled",
      detail: "ESPN companion event ingestion is disabled."
    };
  }

  if (!input || typeof input !== "object") {
    return {
      status: "rejected",
      code: "invalid_message",
      detail: "The companion message must be an object."
    };
  }
  const envelope = input as Record<string, unknown>;
  if (
    envelope.contract !== ESPN_COMPANION_PICK_CONTRACT ||
    envelope.contractVersion !== ESPN_COMPANION_CONTRACT_VERSION
  ) {
    return {
      status: "rejected",
      code: "incompatible_contract",
      detail: "The companion event contract is not supported."
    };
  }

  const parsed = espnCompanionPickMessageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "rejected",
      code: "invalid_message",
      detail: "The companion message failed strict local validation."
    };
  }
  const message = parsed.data;
  if (!policy.supportedObserverVersions.has(message.observerVersion)) {
    return {
      status: "rejected",
      code: "incompatible_observer",
      detail: `Observer ${message.observerVersion} is not supported.`
    };
  }
  if (message.draftId !== policy.expectedDraftId) {
    return {
      status: "rejected",
      code: "draft_mismatch",
      detail: "The companion message does not belong to the paired draft."
    };
  }
  if (policy.seenMessageIds?.has(message.messageId)) {
    return { status: "duplicate", messageId: message.messageId };
  }
  if (
    message.event.eventType !== "pick_removed" &&
    message.event.player.resolution === "uncertain"
  ) {
    return {
      status: "confirmation_required",
      messageId: message.messageId,
      displayName: message.event.player.displayName,
      candidateCanonicalPlayerIds: message.event.player.candidateCanonicalPlayerIds
    };
  }

  const event =
    message.event.eventType === "pick_removed"
      ? newDraftEventSchema.parse({
          eventId: message.messageId,
          draftId: message.draftId,
          source: "espn_companion",
          eventType: message.event.eventType,
          providerEventId: message.event.providerEventId,
          providerTimestamp: message.observedAt,
          correctionReference: message.event.correctionReference
        })
      : newDraftEventSchema.parse({
          eventId: message.messageId,
          draftId: message.draftId,
          source: "espn_companion",
          eventType: message.event.eventType,
          providerEventId: message.event.providerEventId,
          providerTimestamp: message.observedAt,
          overallPick: message.event.overallPick,
          round: message.event.round,
          draftSlot: message.event.draftSlot,
          fantasyTeamId: message.event.fantasyTeamId,
          keeperStatus: message.event.keeperStatus,
          ...("canonicalPlayerId" in message.event.player
            ? { playerId: message.event.player.canonicalPlayerId }
            : {}),
          ...("espnPlayerId" in message.event.player
            ? { playerExternalId: message.event.player.espnPlayerId }
            : {}),
          ...(message.event.eventType === "pick_corrected"
            ? { correctionReference: message.event.correctionReference }
            : {})
        });

  return { status: "accepted", event };
}
