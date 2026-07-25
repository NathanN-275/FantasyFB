"use client";

import type {
  DiscoveredLeague,
  NormalizedLeague,
  ProviderCapabilities
} from "@fantasyfb/league-gateway";
import { useState, type FormEvent } from "react";

type Capability = ProviderCapabilities[keyof ProviderCapabilities];

const fullPprRules = {
  name: "Full PPR",
  statPoints: {
    passingYards: 0.04,
    passingTouchdowns: 4,
    passingInterceptions: -2,
    rushingYards: 0.1,
    rushingTouchdowns: 6,
    receivingYards: 0.1,
    receptions: 1,
    receivingTouchdowns: 6,
    fieldGoalsMade: 3,
    extraPointsMade: 1,
    defenseSacks: 1,
    defenseInterceptions: 2,
    defenseFumbleRecoveries: 2,
    defenseSafeties: 2,
    defenseTouchdowns: 6
  },
  customPointValues: {},
  thresholdBonuses: [],
  longPlayBonuses: [],
  defensePointsAllowedTiers: [],
  defenseYardsAllowedTiers: []
};

const defaultRosterSlots = [
  { label: "QB", eligiblePositions: ["QB"], count: 1, kind: "starter" },
  { label: "RB", eligiblePositions: ["RB"], count: 2, kind: "starter" },
  { label: "WR", eligiblePositions: ["WR"], count: 2, kind: "starter" },
  { label: "TE", eligiblePositions: ["TE"], count: 1, kind: "starter" },
  { label: "FLEX", eligiblePositions: ["RB", "WR", "TE"], count: 1, kind: "starter" },
  {
    label: "BN",
    eligiblePositions: ["QB", "RB", "WR", "TE", "K", "DEF"],
    count: 6,
    kind: "bench"
  },
  {
    label: "IR",
    eligiblePositions: ["QB", "RB", "WR", "TE", "K", "DEF"],
    count: 1,
    kind: "injured-reserve"
  }
];

export function LeagueGatewayPanel({ defaultSeason }: { defaultSeason: number }) {
  const [discovered, setDiscovered] = useState<readonly DiscoveredLeague[]>([]);
  const [league, setLeague] = useState<NormalizedLeague>();
  const [portableJson, setPortableJson] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function discover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    setDiscovered([]);
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      username: String(form.get("username")),
      season: String(form.get("season"))
    });
    try {
      const response = await fetch(`/api/private/leagues/sleeper?${params}`);
      const result = (await response.json()) as {
        leagues?: DiscoveredLeague[];
        error?: string;
      };
      if (!response.ok || !result.leagues) {
        throw new Error(result.error ?? "Sleeper league discovery failed.");
      }
      setDiscovered(result.leagues);
      setMessage(
        result.leagues.length
          ? `Found ${result.leagues.length} Sleeper league${result.leagues.length === 1 ? "" : "s"}.`
          : "No Sleeper leagues were found for that user and season."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sleeper league discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  async function normalize(input: unknown) {
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/private/leagues/normalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const result = (await response.json()) as {
        league?: NormalizedLeague;
        portableJson?: string;
        error?: string;
      };
      if (!response.ok || !result.league || !result.portableJson) {
        throw new Error(result.error ?? "League normalization failed.");
      }
      setLeague(result.league);
      setPortableJson(result.portableJson);
      setMessage(`${result.league.identity.name} is normalized and ready to export.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "League normalization failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const provider = String(form.get("provider")) as "manual" | "espn";
      await normalize({
        source: provider,
        league: {
          provider,
          name: String(form.get("name")),
          season: Number(form.get("season")),
          teamCount: Number(form.get("teamCount")),
          scoringRules: parseJsonField(form, "scoringRules", "scoring rules"),
          rosterSlots: parseJsonField(form, "rosterSlots", "roster slots"),
          managers: parseJsonField(form, "managers", "managers"),
          teams: parseJsonField(form, "teams", "teams and rosters"),
          ...(String(form.get("draft")).trim()
            ? { draft: parseJsonField(form, "draft", "draft order") }
            : {})
        }
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Manual configuration is invalid.");
    }
  }

  async function importPortable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("leagueFile");
    if (!(file instanceof File) || !file.size) {
      setMessage("Choose a FantasyFB league JSON file.");
      return;
    }
    if (file.size > 500_000) {
      setMessage("League import exceeds the 500 KB limit.");
      return;
    }
    await normalize({ source: "portable-json", contents: await file.text() });
  }

  function downloadPortable() {
    if (!portableJson || !league) return;
    const blob = new Blob([portableJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(league.identity.name)}-${league.identity.season}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="league-gateway" aria-labelledby="league-gateway-heading">
      <p className="eyebrow">LEAGUE GATEWAY</p>
      <h2 id="league-gateway-heading">Configure a league</h2>
      <p>
        Import a Sleeper league through documented read-only endpoints, build a complete manual or
        ESPN profile, or restore portable FantasyFB JSON. Passwords and ESPN cookies are never
        requested.
      </p>

      <div className="league-gateway-grid">
        <form className="league-card" onSubmit={discover}>
          <p className="section-kicker">SLEEPER</p>
          <h3>Discover leagues</h3>
          <label>
            Sleeper username
            <input name="username" autoComplete="off" required />
          </label>
          <label>
            Season
            <input
              name="season"
              type="number"
              min="2017"
              max="2100"
              defaultValue={defaultSeason}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Discover leagues
          </button>
          {discovered.length ? (
            <ul className="league-discovery-list">
              {discovered.map((item) => (
                <li key={item.providerLeagueId}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.teamCount} teams · {item.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      normalize({ source: "sleeper", leagueId: item.providerLeagueId })
                    }
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>

        <form className="league-card league-manual-form" onSubmit={createManual}>
          <p className="section-kicker">MANUAL / ESPN</p>
          <h3>Build a league profile</h3>
          <div className="league-form-row">
            <label>
              Provider
              <select name="provider" defaultValue="manual">
                <option value="manual">Manual</option>
                <option value="espn">ESPN manual profile</option>
              </select>
            </label>
            <label>
              League name
              <input name="name" defaultValue="My 2026 League" required />
            </label>
            <label>
              Season
              <input
                name="season"
                type="number"
                min="2017"
                max="2100"
                defaultValue={defaultSeason}
                required
              />
            </label>
            <label>
              Team count
              <input name="teamCount" type="number" min="2" max="64" defaultValue="12" required />
            </label>
          </div>
          <details>
            <summary>Advanced scoring, rosters, teams, and draft order</summary>
            <p>
              These fields use validated portable JSON so custom decimal values, negative scoring,
              unusual lineup slots, team rosters, and draft orders are preserved exactly.
            </p>
            <label>
              Scoring rules
              <textarea name="scoringRules" defaultValue={pretty(fullPprRules)} required />
            </label>
            <label>
              Roster slots
              <textarea name="rosterSlots" defaultValue={pretty(defaultRosterSlots)} required />
            </label>
            <label>
              Managers
              <textarea name="managers" defaultValue="[]" required />
            </label>
            <label>
              Teams and rosters
              <textarea name="teams" defaultValue="[]" required />
            </label>
            <label>
              Draft identity, status, and order (optional)
              <textarea
                name="draft"
                placeholder='{"id":"draft-1","status":"pre-draft","order":[]}'
              />
            </label>
          </details>
          <button type="submit" disabled={busy}>
            Normalize profile
          </button>
        </form>

        <form className="league-card" onSubmit={importPortable}>
          <p className="section-kicker">PORTABLE JSON</p>
          <h3>Restore a league</h3>
          <label>
            FantasyFB league JSON
            <input name="leagueFile" type="file" accept=".json,application/json" required />
          </label>
          <button type="submit" disabled={busy}>
            Import JSON
          </button>
        </form>
      </div>

      {message ? <p role="status">{message}</p> : null}
      {league ? <LeagueSummary league={league} onDownload={downloadPortable} busy={busy} /> : null}
    </section>
  );
}

function LeagueSummary({
  league,
  onDownload,
  busy
}: {
  league: NormalizedLeague;
  onDownload: () => void;
  busy: boolean;
}) {
  const capabilities = league.provider.capabilities;
  return (
    <article className="league-summary" aria-labelledby="normalized-league-heading">
      <div className="league-summary-heading">
        <div>
          <p className="section-kicker">NORMALIZED LEAGUE</p>
          <h3 id="normalized-league-heading">{league.identity.name}</h3>
          <p>
            {league.provider.label} · {league.identity.season} · {league.teamCount} teams
          </p>
        </div>
        <button type="button" onClick={onDownload} disabled={busy}>
          Export JSON
        </button>
      </div>

      <dl className="league-metrics">
        <div>
          <dt>Scoring</dt>
          <dd>{league.scoring.rules.name}</dd>
        </div>
        <div>
          <dt>Roster slots</dt>
          <dd>{league.rosterConfiguration.slots.reduce((total, slot) => total + slot.count, 0)}</dd>
        </div>
        <div>
          <dt>Managers</dt>
          <dd>{league.managers.length}</dd>
        </div>
        <div>
          <dt>Imported teams</dt>
          <dd>{league.teams.length}</dd>
        </div>
        <div>
          <dt>Roster players</dt>
          <dd>
            {league.teams.reduce((total, team) => total + team.roster.playerExternalIds.length, 0)}
          </dd>
        </div>
        <div>
          <dt>Draft</dt>
          <dd>{league.draft?.status ?? "Not discovered"}</dd>
        </div>
      </dl>

      <section aria-labelledby="capabilities-heading">
        <h3 id="capabilities-heading">Provider capabilities</h3>
        <ul className="capability-list">
          <CapabilityRow
            label="Automatic league import"
            capability={capabilities.automaticLeagueImport}
          />
          <CapabilityRow
            label="Automatic draft synchronization"
            capability={capabilities.automaticDraftSynchronization}
          />
          <CapabilityRow label="Manual mode" capability={capabilities.manualMode} />
          <CapabilityRow label="Portable imports" capability={capabilities.portableImport} />
        </ul>
      </section>

      {league.scoring.unsupportedFields.length ? (
        <section aria-labelledby="scoring-review-heading">
          <h3 id="scoring-review-heading">Scoring fields requiring review</h3>
          <ul>
            {league.scoring.unsupportedFields.map((field) => (
              <li key={field.field}>
                <strong>{field.field}</strong> ({field.value}): {field.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {league.warnings.length ? (
        <section aria-labelledby="league-warnings-heading">
          <h3 id="league-warnings-heading">Import notes</h3>
          <ul>
            {league.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function CapabilityRow({ label, capability }: { label: string; capability: Capability }) {
  return (
    <li>
      <span className={`capability-state capability-${capability.state}`}>{capability.state}</span>
      <div>
        <strong>{label}</strong>
        <span>{capability.detail}</span>
      </div>
    </li>
  );
}

function parseJsonField(form: FormData, name: string, label: string): unknown {
  try {
    return JSON.parse(String(form.get(name)));
  } catch {
    throw new Error(`The ${label} field must contain valid JSON.`);
  }
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "fantasyfb-league"
  );
}
