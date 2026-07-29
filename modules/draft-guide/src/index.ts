import { z } from "zod";

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const SOURCE_KINDS = [
  "model",
  "ranking",
  "historical",
  "adp",
  "roster",
  "expert",
  "editorial"
] as const;
const EDITORIAL_CATEGORIES = ["sleeper", "breakout", "bust-risk", "rookie", "late-round"] as const;

const finiteNumber = z.number().finite();
const positionSchema = z.enum(POSITIONS);
const sourceKindSchema = z.enum(SOURCE_KINDS);

const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: sourceKindSchema,
    datasetVersion: z.string().min(1),
    retrievedAt: z.coerce.date(),
    effectiveAt: z.coerce.date().optional(),
    sourceUrl: z.string().url().optional(),
    usageNote: z.string().min(1),
    isSample: z.boolean()
  })
  .strict();

const playerSchema = z
  .object({
    playerId: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    playerName: z.string().min(1),
    position: positionSchema,
    team: z.string().min(2).max(4),
    byeWeek: z.number().int().min(1).max(18),
    model: z
      .object({
        overallRank: z.number().int().positive(),
        positionRank: z.number().int().positive(),
        tier: z.number().int().positive(),
        projectedPoints: finiteNumber,
        floor: finiteNumber,
        ceiling: finiteNumber,
        confidence: finiteNumber.min(0).max(1),
        riskScore: finiteNumber.min(0).max(100),
        positionalScarcity: finiteNumber.min(0).max(1),
        projectionSourceId: z.string().min(1),
        rankingSourceId: z.string().min(1)
      })
      .strict()
      .refine(
        (model) => model.floor <= model.projectedPoints && model.projectedPoints <= model.ceiling,
        {
          message: "Model bounds must satisfy floor <= projectedPoints <= ceiling."
        }
      ),
    adp: z
      .object({
        overall: finiteNumber.positive(),
        sourceId: z.string().min(1)
      })
      .strict()
      .optional(),
    history: z
      .object({
        seasons: z
          .array(
            z
              .object({
                season: z.number().int().min(1920).max(2100),
                fantasyPoints: finiteNumber
              })
              .strict()
          )
          .min(1),
        sourceId: z.string().min(1)
      })
      .strict()
      .optional(),
    rosterContext: z
      .object({
        experienceYears: z.number().int().nonnegative(),
        depthRole: z.enum(["starter", "committee", "backup", "unknown"]),
        handcuffToPlayerId: z.string().min(1).optional(),
        sourceId: z.string().min(1)
      })
      .strict()
      .optional(),
    editorial: z
      .object({
        categories: z.array(z.enum(EDITORIAL_CATEGORIES)).min(1),
        note: z.string().min(1),
        sourceId: z.string().min(1)
      })
      .strict()
      .optional()
  })
  .strict();

export const draftGuideInputSchema = z
  .object({
    build: z
      .object({
        season: z.number().int().min(1920).max(2100),
        generatedAt: z.coerce.date(),
        projectionVersion: z.string().min(1),
        rankingVersion: z.string().min(1),
        adpSnapshot: z.string().min(1).optional(),
        scoring: z
          .object({
            label: z.string().min(1),
            receptionPoints: finiteNumber,
            passingTouchdownPoints: finiteNumber,
            notes: z.array(z.string().min(1)).default([])
          })
          .strict(),
        league: z
          .object({
            teamCount: z.number().int().min(2).max(32),
            rosterSize: z.number().int().positive(),
            starters: z
              .array(
                z
                  .object({
                    position: z.string().min(1),
                    count: z.number().int().positive()
                  })
                  .strict()
              )
              .min(1)
          })
          .strict()
      })
      .strict(),
    sources: z.array(sourceSchema).min(1),
    players: z.array(playerSchema).min(1)
  })
  .strict()
  .superRefine((input, context) => {
    const sourcesById = new Map<string, z.infer<typeof sourceSchema>>();
    input.sources.forEach((source, index) => {
      if (sourcesById.has(source.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "id"],
          message: `Duplicate source ID: ${source.id}`
        });
      }
      if (source.retrievedAt > input.build.generatedAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", index, "retrievedAt"],
          message: `Source ${source.id} cannot be retrieved after the guide build.`
        });
      }
      sourcesById.set(source.id, source);
    });

    const playersById = new Map<string, z.infer<typeof playerSchema>>();
    const slugs = new Set<string>();
    const overallRanks = new Set<number>();
    input.players.forEach((player, index) => {
      if (playersById.has(player.playerId)) {
        addIssue(
          context,
          ["players", index, "playerId"],
          `Duplicate player ID: ${player.playerId}`
        );
      }
      if (slugs.has(player.slug)) {
        addIssue(context, ["players", index, "slug"], `Duplicate player slug: ${player.slug}`);
      }
      if (overallRanks.has(player.model.overallRank)) {
        addIssue(
          context,
          ["players", index, "model", "overallRank"],
          `Duplicate model rank: ${player.model.overallRank}`
        );
      }
      playersById.set(player.playerId, player);
      slugs.add(player.slug);
      overallRanks.add(player.model.overallRank);

      const references = [
        {
          id: player.model.projectionSourceId,
          allowed: ["model"] as SourceKind[],
          path: ["players", index, "model", "projectionSourceId"]
        },
        {
          id: player.model.rankingSourceId,
          allowed: ["ranking", "model"] as SourceKind[],
          path: ["players", index, "model", "rankingSourceId"]
        },
        ...(player.adp
          ? [
              {
                id: player.adp.sourceId,
                allowed: ["adp"] as SourceKind[],
                path: ["players", index, "adp", "sourceId"]
              }
            ]
          : []),
        ...(player.history
          ? [
              {
                id: player.history.sourceId,
                allowed: ["historical"] as SourceKind[],
                path: ["players", index, "history", "sourceId"]
              }
            ]
          : []),
        ...(player.rosterContext
          ? [
              {
                id: player.rosterContext.sourceId,
                allowed: ["roster"] as SourceKind[],
                path: ["players", index, "rosterContext", "sourceId"]
              }
            ]
          : []),
        ...(player.editorial
          ? [
              {
                id: player.editorial.sourceId,
                allowed: ["editorial"] as SourceKind[],
                path: ["players", index, "editorial", "sourceId"]
              }
            ]
          : [])
      ];

      for (const reference of references) {
        const source = sourcesById.get(reference.id);
        if (!source) {
          addIssue(context, reference.path, `Unknown source ID: ${reference.id}`);
        } else if (!reference.allowed.includes(source.kind)) {
          addIssue(
            context,
            reference.path,
            `Source ${reference.id} has kind ${source.kind}; expected ${reference.allowed.join(" or ")}.`
          );
        }
      }
    });

    input.players.forEach((player, index) => {
      const targetId = player.rosterContext?.handcuffToPlayerId;
      if (!targetId) return;
      const target = playersById.get(targetId);
      if (!target) {
        addIssue(
          context,
          ["players", index, "rosterContext", "handcuffToPlayerId"],
          `Unknown handcuff target: ${targetId}`
        );
        return;
      }
      if (target.playerId === player.playerId || target.team !== player.team) {
        addIssue(
          context,
          ["players", index, "rosterContext", "handcuffToPlayerId"],
          "A handcuff must reference a different player on the same NFL team."
        );
      }
    });
  });

export type DraftGuideInput = z.input<typeof draftGuideInputSchema>;
export type DraftGuidePosition = (typeof POSITIONS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface GuideEvidence {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly datasetVersion: string;
  readonly signal: string;
}

export interface GuidePlayerReference {
  readonly playerId: string;
  readonly slug: string;
  readonly playerName: string;
  readonly position: DraftGuidePosition;
  readonly team: string;
}

export interface GuidePlayerCallout {
  readonly id: string;
  readonly player: GuidePlayerReference;
  readonly headline: string;
  readonly explanation: string;
  readonly metrics: readonly string[];
  readonly evidence: readonly GuideEvidence[];
}

export interface GuideCalloutCollection {
  readonly title: string;
  readonly description: string;
  readonly items: readonly GuidePlayerCallout[];
  readonly emptyReason?: string;
}

export interface GuideNarrative {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface GuideTier {
  readonly tier: number;
  readonly players: readonly GuidePlayerCallout[];
}

export interface GuideRoundTarget {
  readonly round: number;
  readonly label: string;
  readonly players: readonly GuidePlayerCallout[];
}

export interface DraftGuide {
  readonly metadata: {
    readonly season: number;
    readonly generatedAt: Date;
    readonly datasetVersions: readonly string[];
    readonly projectionVersion: string;
    readonly rankingVersion: string;
    readonly adpSnapshot: string | null;
    readonly scoringAssumptions: readonly string[];
    readonly leagueSizeAssumptions: readonly string[];
    readonly sampleData: boolean;
  };
  readonly navigation: readonly { readonly id: string; readonly label: string }[];
  readonly overallStrategy: readonly GuideNarrative[];
  readonly positionStrategy: readonly GuideNarrative[];
  readonly leagueSizeEffects: GuideNarrative;
  readonly scoringFormatEffects: GuideNarrative;
  readonly roundTargets: readonly GuideRoundTarget[];
  readonly playerTiers: readonly GuideTier[];
  readonly sleepers: GuideCalloutCollection;
  readonly breakoutCandidates: GuideCalloutCollection;
  readonly bustRiskPlayers: GuideCalloutCollection;
  readonly rookies: GuideCalloutCollection;
  readonly handcuffs: GuideCalloutCollection;
  readonly lateRoundTargets: GuideCalloutCollection;
  readonly byeWeekPlanning: readonly GuideNarrative[];
  readonly rosterConstruction: readonly GuideNarrative[];
  readonly positionScarcity: readonly GuideNarrative[];
  readonly modelVersusAdp: GuideCalloutCollection;
  readonly draftDayChecklist: readonly string[];
  readonly glossary: readonly { readonly term: string; readonly definition: string }[];
  readonly warnings: readonly string[];
  readonly sources: readonly z.infer<typeof sourceSchema>[];
}

const NAVIGATION = [
  ["strategy", "Strategy"],
  ["rounds", "Round targets"],
  ["tiers", "Tiers"],
  ["targets", "Player targets"],
  ["construction", "Roster construction"],
  ["checklist", "Checklist"],
  ["glossary", "Glossary"],
  ["sources", "Sources"]
] as const;

/**
 * Generates a complete, immutable draft guide from validated and traceable structured inputs.
 * It performs no I/O and never invents a player claim when its supporting signal is unavailable.
 */
export function generateDraftGuide(rawInput: DraftGuideInput): DraftGuide {
  const input = draftGuideInputSchema.parse(rawInput);
  const sourcesById = new Map(input.sources.map((source) => [source.id, source]));
  const players = [...input.players].sort(
    (left, right) => left.model.overallRank - right.model.overallRank
  );
  const warnings = buildWarnings(players, input.build.adpSnapshot);

  const sleepers = players.filter(
    (player) => hasCategory(player, "sleeper") || adpGap(player) >= 8
  );
  const breakouts = players.filter(
    (player) =>
      hasCategory(player, "breakout") ||
      (historicalGrowth(player) >= 0.15 && ceilingUplift(player) >= 0.15)
  );
  const bustRisks = players.filter(
    (player) =>
      hasCategory(player, "bust-risk") || player.model.riskScore >= 60 || adpGap(player) <= -8
  );
  const rookies = players.filter(
    (player) => hasCategory(player, "rookie") || player.rosterContext?.experienceYears === 0
  );
  const handcuffs = players.filter(
    (player) => player.rosterContext?.handcuffToPlayerId !== undefined
  );
  const lateRound = players.filter(
    (player) =>
      hasCategory(player, "late-round") ||
      (player.model.overallRank > input.build.league.teamCount * 6 && adpGap(player) >= 0)
  );
  const modelAdpDifferences = players.filter((player) => Math.abs(adpGap(player)) >= 8);

  return {
    metadata: {
      season: input.build.season,
      generatedAt: input.build.generatedAt,
      datasetVersions: [...new Set(input.sources.map((source) => source.datasetVersion))].sort(),
      projectionVersion: input.build.projectionVersion,
      rankingVersion: input.build.rankingVersion,
      adpSnapshot: input.build.adpSnapshot ?? null,
      scoringAssumptions: [
        input.build.scoring.label,
        `${pointValue(input.build.scoring.receptionPoints)} per reception`,
        `${pointValue(input.build.scoring.passingTouchdownPoints)} per passing touchdown`,
        ...input.build.scoring.notes
      ],
      leagueSizeAssumptions: [
        `${input.build.league.teamCount} teams`,
        `${input.build.league.rosterSize} roster spots per team`,
        ...input.build.league.starters.map(
          (starter) => `${starter.count} starting ${starter.position}`
        )
      ],
      sampleData: input.sources.every((source) => source.isSample)
    },
    navigation: NAVIGATION.map(([id, label]) => ({ id, label })),
    overallStrategy: buildOverallStrategy(input.build.league.teamCount, players),
    positionStrategy: buildPositionStrategy(players),
    leagueSizeEffects: buildLeagueSizeEffects(
      input.build.league.teamCount,
      input.build.league.rosterSize
    ),
    scoringFormatEffects: buildScoringEffects(
      input.build.scoring.label,
      input.build.scoring.receptionPoints,
      input.build.scoring.passingTouchdownPoints
    ),
    roundTargets: buildRoundTargets(players, input.build.league.teamCount, sourcesById),
    playerTiers: buildTiers(players, sourcesById),
    sleepers: collection(
      "Sleepers",
      "Players the model values materially earlier than the available draft market or that carry a documented editorial sleeper tag.",
      sleepers,
      sourcesById,
      (player) => `Model rank ${player.model.overallRank} versus ADP ${formatAdp(player)}`,
      "No player met the validated sleeper criteria in this build."
    ),
    breakoutCandidates: collection(
      "Breakout candidates",
      "Candidates require a documented editorial input or both historical growth and meaningful model ceiling.",
      breakouts,
      sourcesById,
      (player) =>
        `${formatPercent(historicalGrowth(player))} recent historical growth with a ${formatPercent(
          ceilingUplift(player)
        )} model ceiling premium`,
      "No player had enough historical and projection evidence to qualify."
    ),
    bustRiskPlayers: collection(
      "Bust-risk players",
      "Risk flags combine model risk, market cost, and documented editorial context; they are not predictions of failure.",
      bustRisks,
      sourcesById,
      (player) =>
        `${Math.round(player.model.riskScore)}/100 model risk; model rank ${player.model.overallRank} versus ADP ${formatAdp(player)}`,
      "No player crossed the configured risk thresholds."
    ),
    rookies: collection(
      "Rookies",
      "Rookie callouts require validated roster context or explicit documented editorial classification.",
      rookies,
      sourcesById,
      (player) => `${player.rosterContext?.experienceYears ?? "Unknown"} years of NFL experience`,
      "No validated rookie records are present in this guide build."
    ),
    handcuffs: collection(
      "Handcuffs",
      "Handcuffs appear only when structured roster context links a backup to a teammate.",
      handcuffs,
      sourcesById,
      (player) => handcuffHeadline(player, players),
      "No validated handcuff relationships are present in this guide build."
    ),
    lateRoundTargets: collection(
      "Late-round targets",
      "Targets appear after the sixth round in this league format and must retain model or editorial support.",
      lateRound,
      sourcesById,
      (player) =>
        `Model round ${Math.ceil(player.model.overallRank / input.build.league.teamCount)}; ADP ${formatAdp(player)}`,
      "No player met the late-round target criteria."
    ),
    byeWeekPlanning: buildByeWeekPlanning(players),
    rosterConstruction: buildRosterConstruction(input.build.league.starters),
    positionScarcity: buildScarcityNarratives(players),
    modelVersusAdp: collection(
      "Largest Model Rank versus ADP differences",
      "Positive gaps indicate the model ranks a player earlier than the draft market; negative gaps flag market cost.",
      modelAdpDifferences,
      sourcesById,
      (player) => `${formatSigned(adpGap(player), " picks")} of model-versus-ADP difference`,
      "No validated ADP difference reached eight picks."
    ),
    draftDayChecklist: [
      "Confirm the active league size, scoring rules, and starting-lineup requirements.",
      "Refresh the guide when a projection, ranking, or ADP dataset version changes.",
      "Draft through tier breaks instead of following overall rank mechanically.",
      "Recheck injury and availability information from an attributed current source.",
      "Track roster needs without forcing a position ahead of a stronger value tier.",
      "Mark drafted players and verify the correct player identity before every selection.",
      "Treat upside, floor, and expected availability as ranges rather than certainties.",
      "Keep private expert data and league context inside the authenticated workspace."
    ],
    glossary: [
      {
        term: "ADP",
        definition: "Average Draft Position: the average pick where a player is selected."
      },
      {
        term: "Model Rank",
        definition:
          "The ordering produced by the configured FantasyFB projection and ranking model."
      },
      {
        term: "Tier",
        definition:
          "A reproducible group of similarly valued players separated by a meaningful gap."
      },
      {
        term: "Floor",
        definition: "A lower modeled outcome, not a guaranteed minimum."
      },
      {
        term: "Ceiling",
        definition: "An upper modeled outcome, not a guaranteed maximum."
      },
      {
        term: "Sleeper",
        definition:
          "A later-market player supported by a model-versus-ADP gap or documented analysis."
      },
      {
        term: "Handcuff",
        definition:
          "A backup linked by roster context to a teammate whose opportunity could transfer."
      },
      {
        term: "Position scarcity",
        definition:
          "The modeled drop in available value as viable players at a position are selected."
      }
    ],
    warnings,
    sources: input.sources
  };
}

function buildOverallStrategy(
  teamCount: number,
  players: readonly z.infer<typeof playerSchema>[]
): GuideNarrative[] {
  const marketGaps = players.filter((player) => Math.abs(adpGap(player)) >= 8).length;
  return [
    {
      id: "tier-discipline",
      title: "Draft the tier, not the queue",
      body: "Use model tiers to identify meaningful value cliffs. Within the same tier, let roster fit, risk, and expected availability break the tie."
    },
    {
      id: "market-discipline",
      title: "Use the market without obeying it",
      body: `${marketGaps} validated player${
        marketGaps === 1 ? "" : "s"
      } differ from ADP by at least eight picks. In a ${teamCount}-team room, use those gaps to time selections while treating ADP as an estimate, not a promise.`
    },
    {
      id: "uncertainty-discipline",
      title: "Balance floor and ceiling",
      body: "Early selections should protect starting-lineup value; later selections can absorb more risk when the modeled ceiling materially exceeds the median projection."
    }
  ];
}

function buildPositionStrategy(players: readonly z.infer<typeof playerSchema>[]): GuideNarrative[] {
  return POSITIONS.flatMap((position) => {
    const positionPlayers = players.filter((player) => player.position === position);
    if (positionPlayers.length === 0) return [];
    const averageScarcity =
      positionPlayers.reduce((total, player) => total + player.model.positionalScarcity, 0) /
      positionPlayers.length;
    const earliest = positionPlayers[0]!;
    const posture =
      averageScarcity >= 0.7
        ? "The model shows a steep value drop, so protect the last player in a strong tier."
        : averageScarcity >= 0.4
          ? "The model shows a moderate value drop; use tier breaks and roster need together."
          : "The sampled pool is comparatively flat, so avoid forcing the position ahead of a stronger tier.";
    return [
      {
        id: `position-${position.toLowerCase()}`,
        title: `${position} strategy`,
        body: `${posture} The first validated player at this position begins at overall model rank ${earliest.model.overallRank}.`
      }
    ];
  });
}

function buildLeagueSizeEffects(teamCount: number, rosterSize: number): GuideNarrative {
  const depth =
    teamCount >= 14
      ? "A deep player pool will be drafted, increasing replacement-cost pressure."
      : teamCount <= 8
        ? "A shallower player pool leaves more replacement value available, so prioritize difference-makers over depth."
        : "Replacement value tightens steadily, making position runs and tier endings relevant without dictating every pick.";
  return {
    id: "league-size-effects",
    title: `${teamCount}-team league effects`,
    body: `${depth} With ${rosterSize} roster spots per team, the guide evaluates ${teamCount * rosterSize} total drafted slots.`
  };
}

function buildScoringEffects(
  label: string,
  receptionPoints: number,
  passingTouchdownPoints: number
): GuideNarrative {
  const receptionEffect =
    receptionPoints > 0
      ? `${pointValue(receptionPoints)} per reception increases the importance of receiving volume.`
      : "Receptions do not score directly, shifting more value toward yards and touchdowns.";
  const quarterbackEffect =
    passingTouchdownPoints >= 6
      ? "Six-point passing touchdowns increase the relative weight of passing production."
      : "Quarterback value should retain rushing and yardage context because passing touchdowns score below six points.";
  return {
    id: "scoring-format-effects",
    title: `${label} effects`,
    body: `${receptionEffect} ${quarterbackEffect}`
  };
}

function buildRoundTargets(
  players: readonly z.infer<typeof playerSchema>[],
  teamCount: number,
  sourcesById: ReadonlyMap<string, z.infer<typeof sourceSchema>>
): GuideRoundTarget[] {
  const rounds = new Map<number, z.infer<typeof playerSchema>[]>();
  for (const player of players) {
    const round = Math.ceil(player.model.overallRank / teamCount);
    const existing = rounds.get(round) ?? [];
    existing.push(player);
    rounds.set(round, existing);
  }
  return [...rounds.entries()].map(([round, targets]) => ({
    round,
    label: round === 1 ? "Foundation picks" : round <= 4 ? "Core starters" : "Depth and upside",
    players: targets.map((player) =>
      callout(
        player,
        `Model rank ${player.model.overallRank}`,
        `Tier ${player.model.tier} · ${formatAdp(player)} ADP · ${formatPercent(
          player.model.confidence
        )} confidence`,
        sourcesById
      )
    )
  }));
}

function buildTiers(
  players: readonly z.infer<typeof playerSchema>[],
  sourcesById: ReadonlyMap<string, z.infer<typeof sourceSchema>>
): GuideTier[] {
  const tiers = new Map<number, z.infer<typeof playerSchema>[]>();
  for (const player of players) {
    const existing = tiers.get(player.model.tier) ?? [];
    existing.push(player);
    tiers.set(player.model.tier, existing);
  }
  return [...tiers.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tier, tierPlayers]) => ({
      tier,
      players: tierPlayers.map((player) =>
        callout(
          player,
          `${player.position}${player.model.positionRank}`,
          `${formatNumber(player.model.projectedPoints)} projected points with a ${formatNumber(
            player.model.floor
          )}–${formatNumber(player.model.ceiling)} range`,
          sourcesById
        )
      )
    }));
}

function collection(
  title: string,
  description: string,
  players: readonly z.infer<typeof playerSchema>[],
  sourcesById: ReadonlyMap<string, z.infer<typeof sourceSchema>>,
  headline: (player: z.infer<typeof playerSchema>) => string,
  emptyReason: string
): GuideCalloutCollection {
  const items = players.map((player) =>
    callout(
      player,
      headline(player),
      player.editorial?.note ??
        `${player.playerName} is included only because the displayed structured thresholds were met.`,
      sourcesById
    )
  );
  return {
    title,
    description,
    items,
    ...(items.length === 0 ? { emptyReason } : {})
  };
}

function callout(
  player: z.infer<typeof playerSchema>,
  headline: string,
  explanation: string,
  sourcesById: ReadonlyMap<string, z.infer<typeof sourceSchema>>
): GuidePlayerCallout {
  const sourceSignals = [
    [player.model.projectionSourceId, "Model projection"],
    [player.model.rankingSourceId, "Model ranking"],
    ...(player.adp ? [[player.adp.sourceId, "ADP"]] : []),
    ...(player.history ? [[player.history.sourceId, "Historical production"]] : []),
    ...(player.rosterContext ? [[player.rosterContext.sourceId, "Roster context"]] : []),
    ...(player.editorial ? [[player.editorial.sourceId, "Documented editorial input"]] : [])
  ] as const;
  const seen = new Set<string>();
  const evidence = sourceSignals.flatMap(([sourceId, signal]) => {
    if (seen.has(sourceId)) return [];
    seen.add(sourceId);
    const source = sourcesById.get(sourceId);
    if (!source) {
      throw new Error(`Validated source ${sourceId} is unexpectedly unavailable.`);
    }
    return [
      {
        sourceId,
        sourceLabel: source.label,
        datasetVersion: source.datasetVersion,
        signal
      }
    ];
  });

  if (evidence.length === 0) {
    throw new Error(`Player-specific callout ${player.playerId} has no supporting evidence.`);
  }
  return {
    id: `${player.playerId}-${slugify(headline)}`,
    player: {
      playerId: player.playerId,
      slug: player.slug,
      playerName: player.playerName,
      position: player.position,
      team: player.team
    },
    headline,
    explanation,
    metrics: [
      `Model #${player.model.overallRank}`,
      `Tier ${player.model.tier}`,
      `ADP ${formatAdp(player)}`,
      `Risk ${Math.round(player.model.riskScore)}/100`
    ],
    evidence
  };
}

function buildByeWeekPlanning(players: readonly z.infer<typeof playerSchema>[]): GuideNarrative[] {
  const byeCounts = new Map<number, number>();
  for (const player of players.filter((item) => item.model.overallRank <= 60)) {
    byeCounts.set(player.byeWeek, (byeCounts.get(player.byeWeek) ?? 0) + 1);
  }
  const clusteredWeeks = [...byeCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([week]) => week)
    .sort((left, right) => left - right);
  return [
    {
      id: "bye-value-first",
      title: "Do not trade away a tier for a bye week",
      body: "Use bye weeks as a late tie-breaker. A stronger projection tier usually matters more than perfect schedule distribution."
    },
    {
      id: "bye-clusters",
      title: "Track starter clusters",
      body:
        clusteredWeeks.length > 0
          ? `The current top-60 sample contains multiple players in bye week${
              clusteredWeeks.length === 1 ? "" : "s"
            } ${clusteredWeeks.join(", ")}. Recheck the live roster before adding another starter from those weeks.`
          : "No bye week contains multiple top-60 players in the current guide build."
    }
  ];
}

function buildRosterConstruction(
  starters: readonly { readonly position: string; readonly count: number }[]
): GuideNarrative[] {
  const flex = starters.find((starter) => starter.position.toUpperCase().includes("FLEX"));
  return [
    {
      id: "starter-requirements",
      title: "Draft for actual lineup requirements",
      body: `This build assumes ${starters
        .map((starter) => `${starter.count} ${starter.position}`)
        .join(
          ", "
        )}. Bench depth should protect those weekly starters rather than mirror a generic roster.`
    },
    {
      id: "flex-construction",
      title: "Preserve flexibility",
      body: flex
        ? `${flex.count} FLEX starter${flex.count === 1 ? "" : "s"} increase the value of RB/WR/TE depth that can win a weekly lineup spot.`
        : "No FLEX starter is configured, so position-specific starting requirements carry more weight."
    },
    {
      id: "bench-construction",
      title: "Use the bench for contingent value",
      body: "Prioritize upside, role changes, and validated handcuff relationships on the bench; replaceable low-ceiling depth should not block higher-upside paths."
    }
  ];
}

function buildScarcityNarratives(
  players: readonly z.infer<typeof playerSchema>[]
): GuideNarrative[] {
  return POSITIONS.flatMap((position) => {
    const positionPlayers = players.filter((player) => player.position === position);
    if (positionPlayers.length === 0) return [];
    const score =
      positionPlayers.reduce((sum, player) => sum + player.model.positionalScarcity, 0) /
      positionPlayers.length;
    return [
      {
        id: `scarcity-${position.toLowerCase()}`,
        title: `${position} scarcity · ${formatPercent(score)}`,
        body:
          score >= 0.7
            ? "The validated ranking inputs indicate a steep modeled replacement drop."
            : score >= 0.4
              ? "The validated ranking inputs indicate a moderate modeled replacement drop."
              : "The validated ranking inputs indicate a comparatively flat replacement curve."
      }
    ];
  });
}

function buildWarnings(
  players: readonly z.infer<typeof playerSchema>[],
  adpSnapshot: string | undefined
): string[] {
  const warnings: string[] = [];
  const missingAdp = players.filter((player) => !player.adp);
  if (!adpSnapshot) warnings.push("No ADP snapshot identifier was supplied.");
  if (missingAdp.length > 0) {
    warnings.push(
      `${missingAdp.length} player${
        missingAdp.length === 1 ? " is" : "s are"
      } missing ADP and cannot qualify through model-versus-market rules.`
    );
  }
  if (!players.some((player) => player.rosterContext?.experienceYears === 0)) {
    warnings.push("No validated rookie roster records are available.");
  }
  if (!players.some((player) => player.rosterContext?.handcuffToPlayerId)) {
    warnings.push("No validated handcuff relationships are available.");
  }
  return warnings;
}

function hasCategory(
  player: z.infer<typeof playerSchema>,
  category: (typeof EDITORIAL_CATEGORIES)[number]
): boolean {
  return player.editorial?.categories.includes(category) ?? false;
}

function adpGap(player: z.infer<typeof playerSchema>): number {
  return player.adp ? player.adp.overall - player.model.overallRank : 0;
}

function historicalGrowth(player: z.infer<typeof playerSchema>): number {
  const seasons = player.history?.seasons;
  if (!seasons || seasons.length < 2) return 0;
  const sorted = [...seasons].sort((left, right) => left.season - right.season);
  const prior = sorted.at(-2)?.fantasyPoints ?? 0;
  const latest = sorted.at(-1)?.fantasyPoints ?? 0;
  return prior === 0 ? 0 : (latest - prior) / Math.abs(prior);
}

function ceilingUplift(player: z.infer<typeof playerSchema>): number {
  if (player.model.projectedPoints === 0) return 0;
  return (
    (player.model.ceiling - player.model.projectedPoints) / Math.abs(player.model.projectedPoints)
  );
}

function handcuffHeadline(
  player: z.infer<typeof playerSchema>,
  players: readonly z.infer<typeof playerSchema>[]
): string {
  const target = players.find(
    (candidate) => candidate.playerId === player.rosterContext?.handcuffToPlayerId
  );
  return target ? `Documented backup to ${target.playerName}` : "Documented backup role";
}

function formatAdp(player: z.infer<typeof playerSchema>): string {
  return player.adp ? formatNumber(player.adp.overall) : "unavailable";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function pointValue(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? "point" : "points"}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSigned(value: number, suffix: string): string {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}${suffix}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}
