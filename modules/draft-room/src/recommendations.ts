import { z } from "zod";

export const DRAFT_RECOMMENDATION_STRATEGIES = [
  "best-overall-value",
  "safest-selection",
  "highest-upside",
  "positional-need",
  "tier-protection",
  "contrarian-selection"
] as const;

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const recommendationStrategySchema = z.enum(DRAFT_RECOMMENDATION_STRATEGIES);
const positionSchema = z.enum(POSITIONS);
const finiteNumber = z.number().finite();
const identifier = z.string().trim().min(1);

const recommendationPlayerSchema = z
  .object({
    playerId: identifier,
    playerName: identifier,
    position: positionSchema,
    nflTeam: identifier,
    byeWeek: z.number().int().min(1).max(18).nullable(),
    projectedPoints: finiteNumber,
    modelRank: z.number().int().positive(),
    expertRank: z.number().int().positive().nullable(),
    hybridRank: z.number().int().positive().nullable(),
    overallTier: z.number().int().positive(),
    positionTier: z.number().int().positive(),
    valueOverReplacement: finiteNumber,
    positionalScarcity: finiteNumber.min(0).max(1),
    adp: finiteNumber.positive().nullable(),
    floor: finiteNumber,
    ceiling: finiteNumber,
    risk: finiteNumber.min(0).max(1),
    confidence: finiteNumber.min(0).max(1)
  })
  .strict()
  .refine(
    (player) => player.floor <= player.projectedPoints && player.projectedPoints <= player.ceiling,
    { message: "Recommendation player bounds must contain projectedPoints." }
  );

const draftPickSchema = z
  .object({
    eventId: identifier,
    source: z.enum(["sleeper", "manual", "fixture", "espn_companion"]),
    sequence: z.number().int().positive(),
    overallPick: z.number().int().positive(),
    round: z.number().int().positive(),
    draftSlot: z.number().int().positive(),
    fantasyTeamId: identifier,
    playerId: identifier.optional(),
    playerExternalId: identifier.optional(),
    keeperStatus: z.enum(["standard", "keeper"]),
    providerTimestamp: z.string().optional()
  })
  .strict();

const draftStateSchema = z
  .object({
    draftId: identifier,
    status: z.enum(["scheduled", "in_progress", "paused", "completed"]),
    picks: z.array(draftPickSchema),
    recentPicks: z.array(draftPickSchema),
    rosters: z.array(z.unknown()),
    draftedPlayerIds: z.array(identifier),
    unresolvedPlayerExternalIds: z.array(identifier),
    eventCount: z.number().int().min(0),
    lastSequence: z.number().int().min(0),
    warnings: z.array(z.string())
  })
  .strict();

const lineupSlotSchema = z
  .object({
    name: identifier,
    count: z.number().int().positive(),
    eligiblePositions: z.array(positionSchema).min(1)
  })
  .strict();

const recommendationInputSchema = z
  .object({
    draftState: draftStateSchema,
    players: z.array(recommendationPlayerSchema).min(1),
    league: z
      .object({
        teamIds: z.array(identifier).min(2).max(32),
        userTeamId: identifier,
        draftSlot: z.number().int().positive(),
        rounds: z.number().int().positive(),
        currentOverallPick: z.number().int().positive(),
        thirdRoundReversal: z.boolean(),
        tradedPickOwners: z.record(z.string(), identifier),
        scoringConfigurationIdentifier: identifier,
        startingLineup: z.array(lineupSlotSchema).min(1),
        benchSlots: z.number().int().min(0)
      })
      .strict(),
    mode: z.enum(["manual", "sleeper"]),
    synchronization: z
      .object({
        state: z.enum(["live", "stale", "interrupted", "completed"]),
        detail: z.string().min(1),
        checkedAt: z.string().datetime({ offset: true })
      })
      .strict(),
    sourceFreshness: z
      .object({
        projections: z.enum(["fresh", "stale", "unavailable"]),
        rankings: z.enum(["fresh", "stale", "unavailable"]),
        adp: z.enum(["fresh", "stale", "unavailable"])
      })
      .strict(),
    preferences: z
      .object({
        rankingSource: z.enum(["model", "expert", "hybrid"]),
        riskTolerance: z.enum(["conservative", "balanced", "aggressive"]),
        preferredPlayerIds: z.array(identifier),
        avoidedPlayerIds: z.array(identifier),
        preferredPositions: z.array(positionSchema)
      })
      .strict(),
    availabilityOutcomes: z.array(
      z
        .object({
          playerId: identifier,
          targetOverallPick: z.number().int().positive(),
          wasAvailable: z.boolean()
        })
        .strict()
    )
  })
  .strict()
  .superRefine((input, context) => {
    const uniqueTeamIds = new Set(input.league.teamIds);
    if (uniqueTeamIds.size !== input.league.teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["league", "teamIds"],
        message: "Draft team IDs must be unique."
      });
    }
    if (!uniqueTeamIds.has(input.league.userTeamId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["league", "userTeamId"],
        message: "The user team must be part of the draft."
      });
    }
    if (input.league.draftSlot > input.league.teamIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["league", "draftSlot"],
        message: "Draft slot cannot exceed the configured team count."
      });
    }
    if (input.league.teamIds[input.league.draftSlot - 1] !== input.league.userTeamId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["league", "draftSlot"],
        message: "Draft slot must identify the configured user team in team order."
      });
    }
    if (input.league.currentOverallPick > input.league.teamIds.length * input.league.rounds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["league", "currentOverallPick"],
        message: "Current pick cannot exceed the configured draft length."
      });
    }
    for (const [pick, owner] of Object.entries(input.league.tradedPickOwners)) {
      if (!/^[1-9]\d*$/.test(pick) || !uniqueTeamIds.has(owner)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["league", "tradedPickOwners", pick],
          message: "Traded picks must map positive overall picks to configured teams."
        });
      }
    }
  });

export type DraftRecommendationStrategy = (typeof DRAFT_RECOMMENDATION_STRATEGIES)[number];
export type DraftRecommendationPosition = (typeof POSITIONS)[number];
export type DraftRecommendationPlayer = z.infer<typeof recommendationPlayerSchema>;
export type DraftRecommendationInput = z.infer<typeof recommendationInputSchema>;

export interface DraftRecommendation {
  readonly strategy: DraftRecommendationStrategy;
  readonly player: DraftRecommendationPlayer;
  readonly ranking: {
    readonly source: "model" | "expert" | "hybrid";
    readonly rank: number;
    readonly explanation: string;
  };
  readonly positionalNeed: {
    readonly position: DraftRecommendationPosition;
    readonly currentCount: number;
    readonly targetStarterCount: number;
    readonly urgency: number;
    readonly explanation: string;
  };
  readonly tier: {
    readonly overall: number;
    readonly position: number;
    readonly dropAfterPlayer: number;
    readonly explanation: string;
  };
  readonly expectedAvailability: {
    readonly targetOverallPick: number | null;
    readonly probability: number | null;
    readonly label: "unlikely" | "uncertain" | "likely" | "no-later-pick";
    readonly explanation: string;
  };
  readonly adpDifference: number | null;
  readonly rosterEffect: string;
  readonly risk: {
    readonly score: number;
    readonly label: "low" | "moderate" | "high";
    readonly explanation: string;
  };
  readonly explanation: readonly string[];
}

export interface DraftRecommendationResult {
  readonly recommendations: readonly DraftRecommendation[];
  readonly forecast: {
    readonly currentOverallPick: number;
    readonly currentOwnerTeamId: string;
    readonly nextUserPick: number | null;
    readonly followingUserPick: number | null;
    readonly picksUntilNextUserPick: number | null;
    readonly format: "snake" | "third-round-reversal";
  };
  readonly rosterNeeds: readonly {
    readonly position: DraftRecommendationPosition;
    readonly currentCount: number;
    readonly targetStarterCount: number;
    readonly urgency: number;
  }[];
  readonly tierWarnings: readonly string[];
  readonly availabilityModel: {
    readonly formula: string;
    readonly evaluatedSamples: number;
    readonly brierScore: number | null;
    readonly interpretation: string;
  };
  readonly mode: "manual" | "sleeper";
  readonly synchronization: DraftRecommendationInput["synchronization"];
  readonly sourceFreshness: DraftRecommendationInput["sourceFreshness"];
  readonly warnings: readonly string[];
}

interface Candidate {
  readonly player: DraftRecommendationPlayer;
  readonly ranking: DraftRecommendation["ranking"];
  readonly need: DraftRecommendation["positionalNeed"];
  readonly tierDrop: number;
  readonly marketDisagreement: number;
  readonly byeConflictCount: number;
  readonly availabilityProbability: number;
  readonly preferred: boolean;
}

/**
 * Pure draft-decision module. Callers provide reduced draft state and normalized
 * league-aware player signals, then receive six independently explained choices.
 */
export class DraftRecommendationEngine {
  recommend(rawInput: unknown): DraftRecommendationResult {
    const input = recommendationInputSchema.parse(rawInput);
    const warnings = input.draftState.warnings.slice();
    const playersById = new Map(input.players.map((player) => [player.playerId, player]));
    const drafted = new Set(input.draftState.draftedPlayerIds);
    const avoided = new Set(input.preferences.avoidedPlayerIds);
    const eligible = input.players.filter(
      (player) => !drafted.has(player.playerId) && !avoided.has(player.playerId)
    );
    if (!eligible.length) {
      throw new Error("No undrafted recommendation candidates remain after user preferences.");
    }

    const order = buildDraftOrder(input);
    const forecast = createForecast(input, order);
    const countsByTeam = rosterPositionCounts(input.draftState, playersById, input.league.teamIds);
    const userCounts = countsByTeam.get(input.league.userTeamId)!;
    const availabilityTarget =
      forecast.nextUserPick === input.league.currentOverallPick
        ? forecast.followingUserPick
        : forecast.nextUserPick;
    const rosterNeeds = POSITIONS.map((position) => ({
      position,
      currentCount: userCounts[position],
      targetStarterCount: starterCapacity(position, input.league.startingLineup),
      urgency: lineupNeedUrgency(position, userCounts, input.league.startingLineup)
    }));
    const needsByPosition = new Map(rosterNeeds.map((need) => [need.position, need]));
    const relevantRanking = rankingSelector(input, warnings);
    const tierDrops = calculateTierDrops(eligible);

    const candidates = eligible.map<Candidate>((player) => {
      const need = needsByPosition.get(player.position)!;
      return {
        player,
        ranking: relevantRanking(player),
        need: {
          ...need,
          explanation:
            need.targetStarterCount === 0
              ? `${player.position} is not required by a configured starting slot.`
              : need.urgency > 0
                ? `Adding ${player.position} would fill an open configured starter slot; the roster currently has ${need.currentCount} ${player.position} players.`
                : `${player.position} cannot improve the current maximum starter-slot assignment and would add depth.`
        },
        tierDrop: tierDrops.get(player.playerId) ?? 0,
        marketDisagreement:
          player.adp === null
            ? (player.expertRank ?? player.modelRank) - player.modelRank
            : player.adp - relevantRanking(player).rank,
        byeConflictCount: byeConflicts(input, player, playersById),
        availabilityProbability:
          availabilityFor(player, availabilityTarget, input, order, countsByTeam).probability ?? 1,
        preferred:
          input.preferences.preferredPlayerIds.includes(player.playerId) ||
          input.preferences.preferredPositions.includes(player.position)
      };
    });

    const selections = new Map<DraftRecommendationStrategy, Candidate>([
      ["best-overall-value", selectBestOverall(candidates)],
      ["safest-selection", selectSafest(candidates)],
      ["highest-upside", selectUpside(candidates, input.preferences.riskTolerance)],
      ["positional-need", selectNeed(candidates)],
      ["tier-protection", selectTierProtection(candidates)],
      ["contrarian-selection", selectContrarian(candidates)]
    ]);
    const recommendations = DRAFT_RECOMMENDATION_STRATEGIES.map((strategy) =>
      explainRecommendation(
        strategy,
        selections.get(strategy)!,
        input,
        availabilityTarget,
        order,
        countsByTeam
      )
    );

    const tierWarnings = recommendations
      .filter(
        (recommendation) =>
          recommendation.tier.dropAfterPlayer > 0 &&
          (recommendation.expectedAvailability.probability ?? 1) < 0.55
      )
      .map(
        (recommendation) =>
          `${recommendation.player.position} tier ${recommendation.tier.position} may be depleted before pick ${recommendation.expectedAvailability.targetOverallPick}; ${recommendation.player.playerName} precedes a ${round(recommendation.tier.dropAfterPlayer)}-point value drop.`
      )
      .filter((warning, index, all) => all.indexOf(warning) === index);

    for (const [source, freshness] of Object.entries(input.sourceFreshness)) {
      if (freshness !== "fresh") warnings.push(`${source} source is ${freshness}.`);
    }
    if (input.draftState.unresolvedPlayerExternalIds.length) {
      warnings.push(
        `${input.draftState.unresolvedPlayerExternalIds.length} drafted provider player IDs are unresolved; recommendations exclude only known canonical selections.`
      );
    }

    return {
      recommendations,
      forecast,
      rosterNeeds,
      tierWarnings,
      availabilityModel: evaluateAvailabilityModel(input, playersById, order, countsByTeam),
      mode: input.mode,
      synchronization: input.synchronization,
      sourceFreshness: input.sourceFreshness,
      warnings: [...new Set(warnings)]
    };
  }
}

export function createDraftRecommendationEngine(): DraftRecommendationEngine {
  return new DraftRecommendationEngine();
}

function buildDraftOrder(input: DraftRecommendationInput): readonly string[] {
  const { teamIds, rounds, thirdRoundReversal, tradedPickOwners } = input.league;
  const order: string[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const forward =
      round === 1 || (!thirdRoundReversal ? round % 2 === 1 : round >= 4 && round % 2 === 0);
    const roundOrder = forward ? teamIds : [...teamIds].reverse();
    for (const owner of roundOrder) {
      const overallPick = order.length + 1;
      order.push(tradedPickOwners[String(overallPick)] ?? owner);
    }
  }
  return order;
}

function createForecast(
  input: DraftRecommendationInput,
  order: readonly string[]
): DraftRecommendationResult["forecast"] {
  const currentIndex = input.league.currentOverallPick - 1;
  const futureUserPicks = order
    .map((owner, index) => ({ owner, pick: index + 1 }))
    .filter(
      ({ owner, pick }) =>
        owner === input.league.userTeamId && pick >= input.league.currentOverallPick
    )
    .map(({ pick }) => pick);
  return {
    currentOverallPick: input.league.currentOverallPick,
    currentOwnerTeamId: order[currentIndex] ?? input.league.userTeamId,
    nextUserPick: futureUserPicks[0] ?? null,
    followingUserPick: futureUserPicks[1] ?? null,
    picksUntilNextUserPick:
      futureUserPicks[0] === undefined
        ? null
        : Math.max(0, futureUserPicks[0] - input.league.currentOverallPick),
    format: input.league.thirdRoundReversal ? "third-round-reversal" : "snake"
  };
}

function rosterPositionCounts(
  draftState: DraftRecommendationInput["draftState"],
  playersById: ReadonlyMap<string, DraftRecommendationPlayer>,
  teamIds: readonly string[]
): Map<string, Record<DraftRecommendationPosition, number>> {
  const counts = new Map(
    teamIds.map((teamId) => [
      teamId,
      Object.fromEntries(POSITIONS.map((position) => [position, 0])) as Record<
        DraftRecommendationPosition,
        number
      >
    ])
  );
  for (const pick of draftState.picks) {
    if (!pick.playerId) continue;
    const player = playersById.get(pick.playerId);
    const teamCounts = counts.get(pick.fantasyTeamId);
    if (player && teamCounts) teamCounts[player.position] += 1;
  }
  return counts;
}

function starterCapacity(
  position: DraftRecommendationPosition,
  lineup: DraftRecommendationInput["league"]["startingLineup"]
): number {
  return lineup.reduce(
    (total, slot) => total + (slot.eligiblePositions.includes(position) ? slot.count : 0),
    0
  );
}

function lineupNeedUrgency(
  position: DraftRecommendationPosition,
  counts: Readonly<Record<DraftRecommendationPosition, number>>,
  lineup: DraftRecommendationInput["league"]["startingLineup"]
): number {
  const filledBefore = maximumFilledStarterSlots(counts, lineup);
  const openSlots = lineup.reduce((total, slot) => total + slot.count, 0) - filledBefore;
  if (openSlots === 0) return 0;
  const filledWithPositionDepth = maximumFilledStarterSlots(
    { ...counts, [position]: counts[position] + openSlots },
    lineup
  );
  return round(clamp((filledWithPositionDepth - filledBefore) / openSlots, 0, 1));
}

function maximumFilledStarterSlots(
  counts: Readonly<Record<DraftRecommendationPosition, number>>,
  lineup: DraftRecommendationInput["league"]["startingLineup"]
): number {
  const slots = lineup
    .flatMap((slot) => Array.from({ length: slot.count }, () => slot.eligiblePositions))
    .sort((left, right) => left.length - right.length);
  const initial = POSITIONS.map((position) => counts[position]);
  const memo = new Map<string, number>();

  function fill(slotIndex: number, remaining: readonly number[]): number {
    if (slotIndex >= slots.length) return 0;
    const key = `${slotIndex}:${remaining.join(",")}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = fill(slotIndex + 1, remaining);
    for (const position of slots[slotIndex] ?? []) {
      const positionIndex = POSITIONS.indexOf(position);
      if ((remaining[positionIndex] ?? 0) === 0) continue;
      const next = [...remaining];
      next[positionIndex] = next[positionIndex]! - 1;
      best = Math.max(best, 1 + fill(slotIndex + 1, next));
    }
    memo.set(key, best);
    return best;
  }

  return fill(0, initial);
}

function rankingSelector(
  input: DraftRecommendationInput,
  warnings: string[]
): (player: DraftRecommendationPlayer) => DraftRecommendation["ranking"] {
  const desired = input.preferences.rankingSource;
  const hasDesired = input.players.some((player) =>
    desired === "hybrid"
      ? player.hybridRank !== null
      : desired === "expert"
        ? player.expertRank !== null
        : true
  );
  if (!hasDesired && desired !== "model") {
    warnings.push(
      `${desired === "expert" ? "Expert" : "Hybrid"} rankings are unavailable; recommendations use Model Rank and do not relabel it.`
    );
  }
  return (player) => {
    if (desired === "hybrid" && player.hybridRank !== null) {
      return {
        source: "hybrid",
        rank: player.hybridRank,
        explanation: `Hybrid Rank ${player.hybridRank} is the selected ranking source.`
      };
    }
    if (desired === "expert" && player.expertRank !== null) {
      return {
        source: "expert",
        rank: player.expertRank,
        explanation: `Authorized Expert Rank ${player.expertRank} is the selected ranking source.`
      };
    }
    return {
      source: "model",
      rank: player.modelRank,
      explanation:
        desired === "model"
          ? `Model Rank ${player.modelRank} is the selected ranking source.`
          : `Model Rank ${player.modelRank} is shown because ${desired} data is unavailable for this player.`
    };
  };
}

function calculateTierDrops(
  players: readonly DraftRecommendationPlayer[]
): ReadonlyMap<string, number> {
  const drops = new Map<string, number>();
  for (const player of players) {
    const nextTierPlayer = players
      .filter(
        (candidate) =>
          candidate.position === player.position && candidate.positionTier > player.positionTier
      )
      .sort(
        (left, right) => left.positionTier - right.positionTier || left.modelRank - right.modelRank
      )[0];
    drops.set(
      player.playerId,
      nextTierPlayer
        ? Math.max(0, player.valueOverReplacement - nextTierPlayer.valueOverReplacement)
        : 0
    );
  }
  return drops;
}

function comparePreferred(left: Candidate, right: Candidate): number {
  return Number(right.preferred) - Number(left.preferred);
}

function selectBestOverall(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort(
    (left, right) =>
      right.player.valueOverReplacement - left.player.valueOverReplacement ||
      comparePreferred(left, right) ||
      left.byeConflictCount - right.byeConflictCount ||
      left.ranking.rank - right.ranking.rank
  )[0]!;
}

function selectSafest(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort(
    (left, right) =>
      right.player.floor - left.player.floor ||
      left.player.risk - right.player.risk ||
      comparePreferred(left, right) ||
      left.byeConflictCount - right.byeConflictCount ||
      left.ranking.rank - right.ranking.rank
  )[0]!;
}

function selectUpside(
  candidates: readonly Candidate[],
  tolerance: DraftRecommendationInput["preferences"]["riskTolerance"]
): Candidate {
  return [...candidates].sort((left, right) => {
    const leftUpside =
      left.player.ceiling -
      (tolerance === "conservative" ? left.player.risk * left.player.ceiling * 0.25 : 0);
    const rightUpside =
      right.player.ceiling -
      (tolerance === "conservative" ? right.player.risk * right.player.ceiling * 0.25 : 0);
    return (
      rightUpside - leftUpside ||
      comparePreferred(left, right) ||
      right.player.confidence - left.player.confidence
    );
  })[0]!;
}

function selectNeed(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort(
    (left, right) =>
      right.need.urgency - left.need.urgency ||
      right.player.valueOverReplacement - left.player.valueOverReplacement ||
      comparePreferred(left, right) ||
      left.byeConflictCount - right.byeConflictCount
  )[0]!;
}

function selectTierProtection(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort(
    (left, right) =>
      right.tierDrop - left.tierDrop ||
      left.availabilityProbability - right.availabilityProbability ||
      right.player.positionalScarcity - left.player.positionalScarcity ||
      comparePreferred(left, right)
  )[0]!;
}

function selectContrarian(candidates: readonly Candidate[]): Candidate {
  return [...candidates].sort(
    (left, right) =>
      right.marketDisagreement - left.marketDisagreement ||
      comparePreferred(left, right) ||
      right.player.ceiling - left.player.ceiling
  )[0]!;
}

function explainRecommendation(
  strategy: DraftRecommendationStrategy,
  candidate: Candidate,
  input: DraftRecommendationInput,
  targetPick: number | null,
  order: readonly string[],
  countsByTeam: ReadonlyMap<string, Record<DraftRecommendationPosition, number>>
): DraftRecommendation {
  const player = candidate.player;
  const expectedAvailability = availabilityFor(player, targetPick, input, order, countsByTeam);
  const risk = riskFor(player);
  const userRosterSize = input.draftState.picks.filter(
    (pick) => pick.fantasyTeamId === input.league.userTeamId
  ).length;
  const rosterCapacity =
    input.league.startingLineup.reduce((total, slot) => total + slot.count, 0) +
    input.league.benchSlots;
  const remainingRosterSpots = Math.max(0, rosterCapacity - userRosterSize);
  const rosterEffect =
    candidate.need.urgency > 0
      ? `Adds ${player.position} to an open starting-lineup need under ${input.league.scoringConfigurationIdentifier}; ${remainingRosterSpots} of ${rosterCapacity} roster spots remain.`
      : `Adds ${player.position} depth after configured starter demand is covered; ${remainingRosterSpots} of ${rosterCapacity} roster spots remain.`;
  const byeEffect =
    player.byeWeek === null
      ? "The bye week is unavailable, so roster overlap cannot be evaluated."
      : candidate.byeConflictCount === 0
        ? `The bye week ${player.byeWeek} does not overlap a current roster player.`
        : `The bye week ${player.byeWeek} overlaps ${candidate.byeConflictCount} current roster player${candidate.byeConflictCount === 1 ? "" : "s"}.`;
  const strategyExplanation: Record<DraftRecommendationStrategy, string> = {
    "best-overall-value": `${round(player.valueOverReplacement)} projected points over replacement leads the available value comparison.`,
    "safest-selection": `${round(player.floor)}-point floor and ${risk.label} risk support the safety case.`,
    "highest-upside": `${round(player.ceiling)}-point ceiling is the strongest upside fit for the selected ${input.preferences.riskTolerance} tolerance.`,
    "positional-need": `${player.position} need urgency is ${Math.round(candidate.need.urgency * 100)}%.`,
    "tier-protection": `The next ${player.position} tier gives up about ${round(candidate.tierDrop)} points over replacement.`,
    "contrarian-selection":
      player.adp === null
        ? `Model and expert ranks differ by ${round(Math.abs(candidate.marketDisagreement))} slots; ADP is unavailable.`
        : `The selected rank and market ADP differ by ${round(Math.abs(candidate.marketDisagreement))} slots.`
  };
  const tierExplanation = `Overall tier ${player.overallTier}, ${player.position} tier ${player.positionTier}; the next lower position tier trails by about ${round(candidate.tierDrop)} value-over-replacement points.`;
  const adp = player.adp;
  const adpDifference = adp === null ? null : round(adp - input.league.currentOverallPick);
  const adpExplanation =
    adp === null || adpDifference === null
      ? "ADP is unavailable, so no market-versus-current-pick difference is claimed."
      : `ADP ${round(adp)} is ${Math.abs(adpDifference)} pick${Math.abs(adpDifference) === 1 ? "" : "s"} ${adpDifference >= 0 ? "after" : "before"} the current selection.`;

  return {
    strategy: recommendationStrategySchema.parse(strategy),
    player,
    ranking: candidate.ranking,
    positionalNeed: candidate.need,
    tier: {
      overall: player.overallTier,
      position: player.positionTier,
      dropAfterPlayer: round(candidate.tierDrop),
      explanation: tierExplanation
    },
    expectedAvailability,
    adpDifference,
    rosterEffect: `${rosterEffect} ${byeEffect}`,
    risk,
    explanation: [
      strategyExplanation[strategy],
      ...(candidate.preferred
        ? [
            "This player or position is on the user's preference list and won a transparent tie-break."
          ]
        : []),
      candidate.ranking.explanation,
      candidate.need.explanation,
      tierExplanation,
      expectedAvailability.explanation,
      adpExplanation,
      `${rosterEffect} ${byeEffect}`,
      risk.explanation
    ]
  };
}

function byeConflicts(
  input: DraftRecommendationInput,
  player: DraftRecommendationPlayer,
  playersById: ReadonlyMap<string, DraftRecommendationPlayer>
): number {
  if (player.byeWeek === null) return 0;
  return input.draftState.picks.filter((pick) => {
    if (pick.fantasyTeamId !== input.league.userTeamId || !pick.playerId) return false;
    return playersById.get(pick.playerId)?.byeWeek === player.byeWeek;
  }).length;
}

function availabilityFor(
  player: DraftRecommendationPlayer,
  targetPick: number | null,
  input: DraftRecommendationInput,
  order: readonly string[],
  countsByTeam: ReadonlyMap<string, Record<DraftRecommendationPosition, number>>
): DraftRecommendation["expectedAvailability"] {
  if (targetPick === null) {
    return {
      targetOverallPick: null,
      probability: null,
      label: "no-later-pick",
      explanation: "No later user-owned pick remains in the configured draft order."
    };
  }
  const marketPick = player.adp ?? player.hybridRank ?? player.expertRank ?? player.modelRank;
  const spread = Math.max(4, input.league.teamIds.length * 0.45);
  const baseProbability = 1 / (1 + Math.exp(-(marketPick - targetPick) / spread));
  const interveningOwners = order.slice(input.league.currentOverallPick, targetPick - 1);
  const positionNeedyTeams = new Set(
    interveningOwners.filter((teamId) => {
      const counts = countsByTeam.get(teamId);
      return counts
        ? lineupNeedUrgency(player.position, counts, input.league.startingLineup) > 0
        : false;
    })
  ).size;
  const needAdjustment = Math.min(0.3, positionNeedyTeams * 0.04);
  const probability = round(clamp(baseProbability - needAdjustment, 0.02, 0.98));
  return {
    targetOverallPick: targetPick,
    probability,
    label: probability >= 0.67 ? "likely" : probability <= 0.33 ? "unlikely" : "uncertain",
    explanation: `${Math.round(probability * 100)}% modeled chance of reaching pick ${targetPick}, based on ${player.adp === null ? "selected rank" : `ADP ${round(player.adp)}`}, a ${round(spread)}-pick uncertainty spread, and ${positionNeedyTeams} intervening teams with ${player.position} starter demand. This is an estimate, not a guarantee.`
  };
}

function riskFor(player: DraftRecommendationPlayer): DraftRecommendation["risk"] {
  const label = player.risk <= 0.25 ? "low" : player.risk >= 0.55 ? "high" : "moderate";
  return {
    score: round(player.risk),
    label,
    explanation: `${label[0]!.toUpperCase()}${label.slice(1)} supplied risk score ${round(player.risk)} is shown with ${Math.round(player.confidence * 100)}% projection confidence and a ${round(player.ceiling - player.floor)}-point floor-to-ceiling range.`
  };
}

function evaluateAvailabilityModel(
  input: DraftRecommendationInput,
  playersById: ReadonlyMap<string, DraftRecommendationPlayer>,
  order: readonly string[],
  countsByTeam: ReadonlyMap<string, Record<DraftRecommendationPosition, number>>
): DraftRecommendationResult["availabilityModel"] {
  const squaredErrors = input.availabilityOutcomes.flatMap((outcome) => {
    const player = playersById.get(outcome.playerId);
    if (!player) return [];
    const probability = availabilityFor(
      player,
      outcome.targetOverallPick,
      input,
      order,
      countsByTeam
    ).probability!;
    return [(probability - Number(outcome.wasAvailable)) ** 2];
  });
  const brierScore = squaredErrors.length
    ? round(squaredErrors.reduce((total, error) => total + error, 0) / squaredErrors.length)
    : null;
  return {
    formula:
      "availability = logistic((ADP-or-selected-rank - target-pick) / max(4, team-count × 0.45)), reduced for intervening positional need",
    evaluatedSamples: squaredErrors.length,
    brierScore,
    interpretation:
      brierScore === null
        ? "No historical or simulated outcomes were supplied; probability remains explicitly uncalibrated."
        : `Brier score ${brierScore} across ${squaredErrors.length} supplied simulated or historical outcomes; lower is better and zero is perfect.`
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
