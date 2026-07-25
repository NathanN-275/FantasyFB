import { randomUUID } from "node:crypto";
import {
  SCORING_PRESETS,
  scoringRulesSchema,
  type NflPosition,
  type ScoringRules,
  type StatCategory
} from "@fantasyfb/fantasy-core";
import { z } from "zod";

const PROVIDERS = ["sleeper", "manual", "espn"] as const;
const DRAFT_STATUSES = ["pre-draft", "drafting", "complete", "unknown"] as const;
const SLOT_KINDS = ["starter", "bench", "injured-reserve"] as const;
const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const PORTABLE_FORMAT = "fantasyfb-league";
const PORTABLE_VERSION = 1;

const finiteNumber = z.number().finite();
const identifier = z.string().trim().min(1);
const seasonSchema = z.number().int().min(2017).max(2100);

const capabilitySchema = z
  .object({
    state: z.enum(["available", "unavailable", "experimental", "planned"]),
    detail: z.string().min(1)
  })
  .strict();

export const providerCapabilitiesSchema = z
  .object({
    automaticLeagueImport: capabilitySchema,
    automaticDraftSynchronization: capabilitySchema,
    manualMode: capabilitySchema,
    portableImport: capabilitySchema
  })
  .strict();

const rosterSlotSchema = z
  .object({
    label: identifier,
    eligiblePositions: z.array(z.enum(POSITIONS)),
    count: z.number().int().positive(),
    kind: z.enum(SLOT_KINDS)
  })
  .strict();

const managerSchema = z
  .object({
    id: identifier,
    displayName: identifier,
    providerUserId: identifier.optional(),
    isCommissioner: z.boolean().default(false)
  })
  .strict();

const rosterSchema = z
  .object({
    playerExternalIds: z.array(identifier).default([]),
    starterExternalIds: z.array(identifier).default([]),
    injuredReserveExternalIds: z.array(identifier).default([])
  })
  .strict();

const teamSchema = z
  .object({
    id: identifier,
    name: identifier,
    managerIds: z.array(identifier).default([]),
    providerRosterId: identifier.optional(),
    roster: rosterSchema
  })
  .strict();

const draftOrderEntrySchema = z
  .object({
    slot: z.number().int().positive(),
    teamId: identifier.optional(),
    managerId: identifier.optional()
  })
  .strict();

const draftSchema = z
  .object({
    id: identifier,
    providerDraftId: identifier.optional(),
    status: z.enum(DRAFT_STATUSES),
    type: identifier.optional(),
    order: z.array(draftOrderEntrySchema).default([])
  })
  .strict();

const unsupportedFieldSchema = z
  .object({
    field: identifier,
    value: finiteNumber,
    reason: identifier
  })
  .strict();

export const normalizedLeagueSchema = z
  .object({
    format: z.literal(PORTABLE_FORMAT),
    version: z.literal(PORTABLE_VERSION),
    identity: z
      .object({
        id: identifier,
        name: identifier,
        season: seasonSchema,
        providerLeagueId: identifier.optional()
      })
      .strict(),
    provider: z
      .object({
        kind: z.enum(PROVIDERS),
        label: identifier,
        capabilities: providerCapabilitiesSchema
      })
      .strict(),
    teamCount: z.number().int().min(2).max(64),
    scoring: z
      .object({
        rules: scoringRulesSchema,
        unsupportedFields: z.array(unsupportedFieldSchema).default([])
      })
      .strict(),
    rosterConfiguration: z
      .object({
        slots: z.array(rosterSlotSchema).min(1)
      })
      .strict(),
    managers: z.array(managerSchema).default([]),
    teams: z.array(teamSchema).default([]),
    draft: draftSchema.optional(),
    warnings: z.array(z.string().min(1)).default([])
  })
  .strict()
  .superRefine((league, context) => {
    const managerIds = uniqueIds(league.managers, "manager", context);
    const teamIds = uniqueIds(league.teams, "team", context);
    if (league.teams.length > league.teamCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teams"],
        message: "The number of teams cannot exceed the configured team count."
      });
    }
    league.teams.forEach((team, teamIndex) => {
      team.managerIds.forEach((managerId) => {
        if (!managerIds.has(managerId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["teams", teamIndex, "managerIds"],
            message: `Team ${team.id} references unknown manager ${managerId}.`
          });
        }
      });
    });
    league.draft?.order.forEach((entry, entryIndex) => {
      if (entry.teamId && !teamIds.has(entry.teamId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["draft", "order", entryIndex, "teamId"],
          message: `Draft order references unknown team ${entry.teamId}.`
        });
      }
      if (entry.managerId && !managerIds.has(entry.managerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["draft", "order", entryIndex, "managerId"],
          message: `Draft order references unknown manager ${entry.managerId}.`
        });
      }
    });
  });

export type NormalizedLeague = z.infer<typeof normalizedLeagueSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

const manualInputSchema = z
  .object({
    provider: z.enum(["manual", "espn"]),
    name: identifier,
    season: seasonSchema,
    teamCount: z.number().int().min(2).max(64),
    scoringRules: scoringRulesSchema,
    rosterSlots: z.array(rosterSlotSchema).min(1),
    managers: z.array(managerSchema).default([]),
    teams: z.array(teamSchema).default([]),
    draft: draftSchema.optional()
  })
  .strict();

export type ManualLeagueInput = z.input<typeof manualInputSchema>;

const discoveryInputSchema = z
  .object({
    provider: z.literal("sleeper"),
    username: identifier,
    season: seasonSchema
  })
  .strict();

const normalizeInputSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("sleeper"),
      leagueId: identifier
    })
    .strict(),
  z
    .object({
      source: z.enum(["manual", "espn"]),
      league: manualInputSchema
    })
    .strict(),
  z
    .object({
      source: z.literal("portable-json"),
      contents: z.string().min(1)
    })
    .strict()
]);

export interface DiscoveredLeague {
  readonly provider: "sleeper";
  readonly providerLeagueId: string;
  readonly name: string;
  readonly season: number;
  readonly teamCount: number;
  readonly status: string;
}

export interface LeagueGateway {
  discover(input: unknown): Promise<readonly DiscoveredLeague[]>;
  normalize(input: unknown): Promise<NormalizedLeague>;
  exportPortable(league: unknown): string;
}

export type LeagueGatewayErrorCode =
  "invalid-input" | "not-found" | "provider-failure" | "rate-limited";

export class LeagueGatewayError extends Error {
  readonly code: LeagueGatewayErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    code: LeagueGatewayErrorCode,
    message: string,
    options?: { cause?: unknown; retryAfterSeconds?: number }
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LeagueGatewayError";
    this.code = code;
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

type Fetch = typeof globalThis.fetch;

export function createLeagueGateway(
  dependencies: {
    readonly fetch?: Fetch;
    readonly createId?: () => string;
    readonly sleeperBaseUrl?: string;
  } = {}
): LeagueGateway {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const createId = dependencies.createId ?? randomUUID;
  const sleeperBaseUrl = (dependencies.sleeperBaseUrl ?? "https://api.sleeper.app/v1").replace(
    /\/$/,
    ""
  );

  return {
    async discover(input) {
      const request = parseOrGatewayError(discoveryInputSchema, input);
      const user = parseSleeperResponse(
        sleeperUserSchema,
        await requestSleeper(
          fetchImplementation,
          sleeperBaseUrl,
          `/user/${encode(request.username)}`
        ),
        "user record"
      );
      if (!user) {
        throw new LeagueGatewayError(
          "not-found",
          `No Sleeper user was found for "${request.username}".`
        );
      }
      const leagues = parseSleeperResponse(
        sleeperLeagueListSchema,
        await requestSleeper(
          fetchImplementation,
          sleeperBaseUrl,
          `/user/${encode(user.user_id)}/leagues/nfl/${request.season}`
        ),
        "league list"
      );
      return leagues.map((league) => ({
        provider: "sleeper" as const,
        providerLeagueId: league.league_id,
        name: league.name,
        season: parseSeason(league.season),
        teamCount: league.total_rosters,
        status: league.status
      }));
    },

    async normalize(input) {
      const request = parseOrGatewayError(normalizeInputSchema, input);
      if (request.source === "portable-json") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(request.contents);
        } catch (error) {
          throw new LeagueGatewayError("invalid-input", "Portable league JSON is malformed.", {
            cause: error
          });
        }
        return parseOrGatewayError(normalizedLeagueSchema, parsed);
      }
      if (request.source === "manual" || request.source === "espn") {
        if (request.source !== request.league.provider) {
          throw new LeagueGatewayError(
            "invalid-input",
            "The normalization source must match the configured league provider."
          );
        }
        return normalizeManualLeague(request.league, createId);
      }
      if (request.source === "sleeper") {
        return loadSleeperLeague(request.leagueId, fetchImplementation, sleeperBaseUrl, createId);
      }
      throw new LeagueGatewayError("invalid-input", "Unsupported league normalization source.");
    },

    exportPortable(league) {
      return `${JSON.stringify(parseOrGatewayError(normalizedLeagueSchema, league), null, 2)}\n`;
    }
  };
}

function normalizeManualLeague(input: ManualLeagueInput, createId: () => string): NormalizedLeague {
  const league = parseOrGatewayError(manualInputSchema, input);
  return normalizedLeagueSchema.parse({
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    identity: {
      id: createId(),
      name: league.name,
      season: league.season
    },
    provider: {
      kind: league.provider,
      label: league.provider === "espn" ? "ESPN manual profile" : "Manual league",
      capabilities: league.provider === "espn" ? ESPN_CAPABILITIES : MANUAL_CAPABILITIES
    },
    teamCount: league.teamCount,
    scoring: {
      rules: league.scoringRules,
      unsupportedFields: []
    },
    rosterConfiguration: {
      slots: league.rosterSlots
    },
    managers: league.managers,
    teams: league.teams,
    ...(league.draft ? { draft: league.draft } : {}),
    warnings:
      league.provider === "espn"
        ? [
            "Automatic ESPN league import is unavailable.",
            "Automatic ESPN draft synchronization is experimental and disabled.",
            "No ESPN credentials or authentication cookies are requested or stored."
          ]
        : []
  });
}

async function loadSleeperLeague(
  leagueId: string,
  fetchImplementation: Fetch,
  baseUrl: string,
  createId: () => string
): Promise<NormalizedLeague> {
  const [rawLeague, rawUsers, rawRosters, rawDrafts] = await Promise.all([
    requestSleeper(fetchImplementation, baseUrl, `/league/${encode(leagueId)}`),
    requestSleeper(fetchImplementation, baseUrl, `/league/${encode(leagueId)}/users`),
    requestSleeper(fetchImplementation, baseUrl, `/league/${encode(leagueId)}/rosters`),
    requestSleeper(fetchImplementation, baseUrl, `/league/${encode(leagueId)}/drafts`)
  ]);
  const league = parseSleeperResponse(sleeperLeagueSchema, rawLeague, "league record");
  if (!league) {
    throw new LeagueGatewayError("not-found", `Sleeper league ${leagueId} was not found.`);
  }
  const users = parseSleeperResponse(sleeperUsersSchema, rawUsers, "league users");
  const rosters = parseSleeperResponse(sleeperRostersSchema, rawRosters, "league rosters");
  const drafts = parseSleeperResponse(sleeperDraftsSchema, rawDrafts, "league drafts");
  const normalizedScoring = normalizeSleeperScoring(league.scoring_settings);
  const normalizedRoster = normalizeSleeperRosterSlots(league.roster_positions);
  const managers = users.map((user) => ({
    id: `sleeper-manager:${user.user_id}`,
    displayName: user.display_name || user.username || `Sleeper manager ${user.user_id}`,
    providerUserId: user.user_id,
    isCommissioner: user.is_owner ?? false
  }));
  const managerByProviderId = new Map(
    managers.flatMap((manager) =>
      manager.providerUserId ? [[manager.providerUserId, manager.id] as const] : []
    )
  );
  const userByProviderId = new Map(users.map((user) => [user.user_id, user]));
  const teams = rosters.map((roster) => {
    const managerId = roster.owner_id ? managerByProviderId.get(roster.owner_id) : undefined;
    const user = roster.owner_id ? userByProviderId.get(roster.owner_id) : undefined;
    const teamName =
      nonEmptyString(user?.metadata?.team_name) ??
      nonEmptyString(user?.display_name) ??
      `Team ${roster.roster_id}`;
    return {
      id: `sleeper-team:${roster.roster_id}`,
      name: teamName,
      managerIds: managerId ? [managerId] : [],
      providerRosterId: String(roster.roster_id),
      roster: {
        playerExternalIds: roster.players ?? [],
        starterExternalIds: roster.starters ?? [],
        injuredReserveExternalIds: roster.reserve ?? []
      }
    };
  });
  const latestDraft = drafts[0];
  const draft = latestDraft
    ? normalizeSleeperDraft(latestDraft, teams, managerByProviderId, createId)
    : undefined;
  const warnings = [...normalizedScoring.warnings, ...normalizedRoster.warnings];
  if (users.length === 0) warnings.push("Sleeper returned no manager records for this league.");
  if (rosters.length === 0) warnings.push("Sleeper returned no roster records for this league.");
  if (teams.length !== league.total_rosters) {
    warnings.push(
      `Sleeper reported ${league.total_rosters} teams but returned ${teams.length} roster records.`
    );
  }
  if (!draft) warnings.push("Sleeper returned no draft information for this league.");

  return normalizedLeagueSchema.parse({
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    identity: {
      id: createId(),
      name: league.name,
      season: parseSeason(league.season),
      providerLeagueId: league.league_id
    },
    provider: {
      kind: "sleeper",
      label: "Sleeper",
      capabilities: SLEEPER_CAPABILITIES
    },
    teamCount: league.total_rosters,
    scoring: {
      rules: normalizedScoring.rules,
      unsupportedFields: normalizedScoring.unsupportedFields
    },
    rosterConfiguration: {
      slots: normalizedRoster.slots
    },
    managers,
    teams,
    ...(draft ? { draft } : {}),
    warnings
  });
}

function normalizeSleeperDraft(
  draft: SleeperDraft,
  teams: readonly NormalizedLeague["teams"][number][],
  managerByProviderId: ReadonlyMap<string, string>,
  createId: () => string
): NonNullable<NormalizedLeague["draft"]> {
  const teamByRosterId = new Map(
    teams.flatMap((team) =>
      team.providerRosterId ? [[team.providerRosterId, team.id] as const] : []
    )
  );
  const slots = new Set<number>([
    ...Object.values(draft.draft_order ?? {}),
    ...Object.keys(draft.slot_to_roster_id ?? {}).map(Number)
  ]);
  const managerBySlot = new Map(
    Object.entries(draft.draft_order ?? {}).map(([providerUserId, slot]) => [
      slot,
      managerByProviderId.get(providerUserId)
    ])
  );
  const teamBySlot = new Map(
    Object.entries(draft.slot_to_roster_id ?? {}).map(([slot, rosterId]) => [
      Number(slot),
      teamByRosterId.get(String(rosterId))
    ])
  );
  return draftSchema.parse({
    id: createId(),
    providerDraftId: draft.draft_id,
    status: normalizeDraftStatus(draft.status),
    ...(draft.type ? { type: draft.type } : {}),
    order: [...slots]
      .filter((slot) => Number.isInteger(slot) && slot > 0)
      .sort((left, right) => left - right)
      .map((slot) => ({
        slot,
        ...(teamBySlot.get(slot) ? { teamId: teamBySlot.get(slot) } : {}),
        ...(managerBySlot.get(slot) ? { managerId: managerBySlot.get(slot) } : {})
      }))
  });
}

function normalizeDraftStatus(status: string): (typeof DRAFT_STATUSES)[number] {
  if (status === "pre_draft") return "pre-draft";
  if (status === "drafting") return "drafting";
  if (status === "complete") return "complete";
  return "unknown";
}

const SLEEPER_SCORING_FIELDS: Readonly<Record<string, StatCategory>> = {
  pass_yd: "passingYards",
  pass_td: "passingTouchdowns",
  pass_int: "passingInterceptions",
  pass_2pt: "passingTwoPointConversions",
  pass_fd: "passingFirstDowns",
  rush_yd: "rushingYards",
  rush_td: "rushingTouchdowns",
  rush_2pt: "rushingTwoPointConversions",
  rush_fd: "rushingFirstDowns",
  rec_yd: "receivingYards",
  rec: "receptions",
  rec_td: "receivingTouchdowns",
  rec_2pt: "receivingTwoPointConversions",
  rec_fd: "receivingFirstDowns",
  kr_yd: "returnYards",
  pr_yd: "returnYards",
  ret_td: "returnTouchdowns",
  fgm: "fieldGoalsMade",
  fgmiss: "fieldGoalsMissed",
  xpm: "extraPointsMade",
  xpmiss: "extraPointsMissed",
  sack: "defenseSacks",
  int: "defenseInterceptions",
  fumble_rec: "defenseFumbleRecoveries",
  fumble_force: "defenseForcedFumbles",
  safe: "defenseSafeties",
  block_kick: "defenseBlockedKicks",
  def_td: "defenseTouchdowns",
  def_st_td: "defenseReturnTouchdowns"
};

const SLEEPER_THRESHOLD_BONUSES: Readonly<Record<string, { stat: StatCategory; atLeast: number }>> =
  {
    bonus_pass_yd_300: { stat: "passingYards", atLeast: 300 },
    bonus_pass_yd_400: { stat: "passingYards", atLeast: 400 },
    bonus_rush_yd_100: { stat: "rushingYards", atLeast: 100 },
    bonus_rush_yd_200: { stat: "rushingYards", atLeast: 200 },
    bonus_rec_yd_100: { stat: "receivingYards", atLeast: 100 },
    bonus_rec_yd_200: { stat: "receivingYards", atLeast: 200 }
  };

const SLEEPER_LONG_PLAY_BONUSES: Readonly<
  Record<
    string,
    {
      category: "passingTouchdown" | "rushingTouchdown" | "receivingTouchdown";
      atLeastYards: number;
    }
  >
> = {
  bonus_pass_td_40p: { category: "passingTouchdown", atLeastYards: 40 },
  bonus_pass_td_50p: { category: "passingTouchdown", atLeastYards: 50 },
  bonus_rush_td_40p: { category: "rushingTouchdown", atLeastYards: 40 },
  bonus_rush_td_50p: { category: "rushingTouchdown", atLeastYards: 50 },
  bonus_rec_td_40p: { category: "receivingTouchdown", atLeastYards: 40 },
  bonus_rec_td_50p: { category: "receivingTouchdown", atLeastYards: 50 }
};

function normalizeSleeperScoring(scoring: Readonly<Record<string, number>>): {
  rules: ScoringRules;
  unsupportedFields: Array<z.infer<typeof unsupportedFieldSchema>>;
  warnings: string[];
} {
  const statPoints: Partial<Record<StatCategory, number>> = {};
  const thresholdBonuses: ScoringRules["thresholdBonuses"] = [];
  const longPlayBonuses: ScoringRules["longPlayBonuses"] = [];
  const unsupportedFields: Array<z.infer<typeof unsupportedFieldSchema>> = [];

  for (const [field, value] of Object.entries(scoring)) {
    const stat = SLEEPER_SCORING_FIELDS[field];
    if (stat) {
      if (statPoints[stat] !== undefined && statPoints[stat] !== value) {
        unsupportedFields.push({
          field,
          value,
          reason: `Conflicts with another Sleeper field normalized as ${stat}.`
        });
      } else {
        statPoints[stat] = value;
      }
      continue;
    }
    const threshold = SLEEPER_THRESHOLD_BONUSES[field];
    if (threshold) {
      thresholdBonuses.push({ name: field, ...threshold, points: value });
      continue;
    }
    const longPlay = SLEEPER_LONG_PLAY_BONUSES[field];
    if (longPlay) {
      longPlayBonuses.push({ ...longPlay, points: value });
      continue;
    }
    unsupportedFields.push({
      field,
      value,
      reason: "No canonical scoring category is currently defined for this Sleeper field."
    });
  }

  return {
    rules: scoringRulesSchema.parse({
      name: "Sleeper imported scoring",
      statPoints,
      thresholdBonuses,
      longPlayBonuses
    }),
    unsupportedFields,
    warnings:
      unsupportedFields.length > 0
        ? [
            `${unsupportedFields.length} Sleeper scoring field${
              unsupportedFields.length === 1 ? "" : "s"
            } could not be normalized and require manual review.`
          ]
        : []
  };
}

const SLOT_ELIGIBILITY: Readonly<
  Record<string, { eligiblePositions: readonly NflPosition[]; kind: (typeof SLOT_KINDS)[number] }>
> = {
  QB: { eligiblePositions: ["QB"], kind: "starter" },
  RB: { eligiblePositions: ["RB"], kind: "starter" },
  WR: { eligiblePositions: ["WR"], kind: "starter" },
  TE: { eligiblePositions: ["TE"], kind: "starter" },
  K: { eligiblePositions: ["K"], kind: "starter" },
  DEF: { eligiblePositions: ["DEF"], kind: "starter" },
  FLEX: { eligiblePositions: ["RB", "WR", "TE"], kind: "starter" },
  SUPER_FLEX: { eligiblePositions: ["QB", "RB", "WR", "TE"], kind: "starter" },
  WRRB_FLEX: { eligiblePositions: ["RB", "WR"], kind: "starter" },
  REC_FLEX: { eligiblePositions: ["WR", "TE"], kind: "starter" },
  BN: { eligiblePositions: POSITIONS, kind: "bench" },
  IR: { eligiblePositions: POSITIONS, kind: "injured-reserve" }
};

function normalizeSleeperRosterSlots(rosterPositions: readonly string[]): {
  slots: NormalizedLeague["rosterConfiguration"]["slots"];
  warnings: string[];
} {
  const counts = new Map<string, number>();
  rosterPositions.forEach((position) => counts.set(position, (counts.get(position) ?? 0) + 1));
  const warnings: string[] = [];
  const slots = [...counts].map(([label, count]) => {
    const known = SLOT_ELIGIBILITY[label];
    if (!known) {
      warnings.push(
        `Sleeper roster position "${label}" has unknown eligibility and requires manual review.`
      );
    }
    return rosterSlotSchema.parse({
      label,
      eligiblePositions: known?.eligiblePositions ?? [],
      count,
      kind: known?.kind ?? "starter"
    });
  });
  if (!slots.length) {
    throw new LeagueGatewayError(
      "provider-failure",
      "Sleeper returned a league without roster positions."
    );
  }
  return { slots, warnings };
}

async function requestSleeper(
  fetchImplementation: Fetch,
  baseUrl: string,
  path: string
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(`${baseUrl}${path}`, {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache" }
    });
  } catch (error) {
    throw new LeagueGatewayError("provider-failure", "Sleeper could not be reached.", {
      cause: error
    });
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new LeagueGatewayError(
      "rate-limited",
      "Sleeper rate-limited the request. Wait before retrying or use manual mode.",
      Number.isFinite(retryAfter) && retryAfter >= 0 ? { retryAfterSeconds: retryAfter } : undefined
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new LeagueGatewayError(
      "provider-failure",
      `Sleeper returned HTTP ${response.status}. Manual mode remains available.`
    );
  }
  try {
    return await response.json();
  } catch (error) {
    throw new LeagueGatewayError("provider-failure", "Sleeper returned malformed JSON.", {
      cause: error
    });
  }
}

function parseOrGatewayError<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new LeagueGatewayError(
    "invalid-input",
    result.error.issues[0]?.message ?? "Invalid input.",
    {
      cause: result.error
    }
  );
}

function parseSleeperResponse<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
  label: string
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new LeagueGatewayError(
    "provider-failure",
    `Sleeper returned an invalid ${label}. Manual mode remains available.`,
    { cause: result.error }
  );
}

function parseSeason(value: string): number {
  return seasonSchema.parse(Number(value));
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueIds(
  records: readonly { readonly id: string }[],
  label: string,
  context: z.RefinementCtx
): Set<string> {
  const ids = new Set<string>();
  records.forEach((record, index) => {
    if (ids.has(record.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [`${label}s`, index, "id"],
        message: `Duplicate ${label} ID: ${record.id}.`
      });
    }
    ids.add(record.id);
  });
  return ids;
}

export const MANUAL_CAPABILITIES: ProviderCapabilities = {
  automaticLeagueImport: {
    state: "unavailable",
    detail: "League settings are entered manually."
  },
  automaticDraftSynchronization: {
    state: "unavailable",
    detail: "Draft picks must be entered manually."
  },
  manualMode: {
    state: "available",
    detail: "Complete manual league configuration is supported."
  },
  portableImport: {
    state: "available",
    detail: "FantasyFB league JSON can be imported and exported."
  }
};

export const ESPN_CAPABILITIES: ProviderCapabilities = {
  automaticLeagueImport: {
    state: "unavailable",
    detail: "Automatic ESPN league import is unavailable."
  },
  automaticDraftSynchronization: {
    state: "experimental",
    detail: "Automatic draft synchronization is experimental and disabled."
  },
  manualMode: {
    state: "available",
    detail: "Manual ESPN-based league profiles are supported."
  },
  portableImport: {
    state: "available",
    detail: "Portable FantasyFB league imports are supported."
  }
};

export const SLEEPER_CAPABILITIES: ProviderCapabilities = {
  automaticLeagueImport: {
    state: "available",
    detail: "Read-only league, manager, roster, scoring, and draft discovery is available."
  },
  automaticDraftSynchronization: {
    state: "planned",
    detail: "Live polling belongs to the draft event engine and is not active yet."
  },
  manualMode: {
    state: "available",
    detail: "Manual configuration remains available as a fallback."
  },
  portableImport: {
    state: "available",
    detail: "Normalized leagues can be exported as portable FantasyFB JSON."
  }
};

export const DEFAULT_MANUAL_SCORING = SCORING_PRESETS.fullPpr;

const sleeperUserSchema = z
  .object({
    user_id: identifier,
    username: z.string().nullish(),
    display_name: z.string().nullish()
  })
  .passthrough()
  .nullable();

const sleeperLeagueSchema = z
  .object({
    league_id: identifier,
    name: identifier,
    season: z.string().regex(/^\d{4}$/),
    total_rosters: z.number().int().min(2).max(64),
    status: identifier,
    scoring_settings: z.record(z.string(), finiteNumber),
    roster_positions: z.array(identifier)
  })
  .passthrough()
  .nullable();

const sleeperLeagueListSchema = z.array(sleeperLeagueSchema.unwrap());

const sleeperUserInLeagueSchema = z
  .object({
    user_id: identifier,
    username: z.string().nullish(),
    display_name: z.string().nullish(),
    metadata: z
      .object({
        team_name: z.string().nullish()
      })
      .passthrough()
      .nullish(),
    is_owner: z.boolean().optional()
  })
  .passthrough();

const sleeperUsersSchema = z.array(sleeperUserInLeagueSchema);

const sleeperRosterSchema = z
  .object({
    roster_id: z.union([z.number().int().positive(), identifier]),
    owner_id: z.string().nullish(),
    players: z.array(identifier).nullish(),
    starters: z.array(identifier).nullish(),
    reserve: z.array(identifier).nullish()
  })
  .passthrough();

const sleeperRostersSchema = z.array(sleeperRosterSchema);

const sleeperDraftSchema = z
  .object({
    draft_id: identifier,
    status: identifier,
    type: z.string().nullish(),
    draft_order: z.record(z.string(), z.number().int().positive()).nullish(),
    slot_to_roster_id: z
      .record(z.string(), z.union([z.number().int().positive(), identifier]))
      .nullish()
  })
  .passthrough();

const sleeperDraftsSchema = z.array(sleeperDraftSchema);
type SleeperDraft = z.infer<typeof sleeperDraftSchema>;
