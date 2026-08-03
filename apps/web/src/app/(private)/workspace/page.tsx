import { SignOutButton } from "../../../components/auth-buttons";
import { ExpertImportPanel } from "../../../components/expert-import-panel";
import { DraftRoomPanel } from "../../../components/draft-room-panel";
import { LeagueGatewayPanel } from "../../../components/league-gateway-panel";
import { TradeAnalyzerPanel } from "../../../components/trade-analyzer-panel";
import { TRADE_DEMO_INPUT } from "../../../fixtures/trade-evaluation";
import { requireAuthorizedUser } from "../../../server/auth/private-access";
import { getExpertDataStatus } from "../../../server/expert-data";
import { getPrivateWorkspaceOverview } from "../../../server/private-workspace";
import Link from "next/link";
import { updateWorkspacePreferences } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireAuthorizedUser();
  const currentSeason = new Date().getFullYear();
  const [expertStatus, overview] = await Promise.all([
    getExpertDataStatus(currentSeason),
    getPrivateWorkspaceOverview(user)
  ]);

  return (
    <main className="research-shell workspace-shell">
      <nav className="site-nav" aria-label="Private workspace navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <a href="#leagues">Leagues</a>
          <a href="#saved-work">Saved work</a>
          <a href="#settings">Settings</a>
          <a href="#refresh-status">Refresh status</a>
          <Link href="/workspace/data-health">Data health</Link>
        </div>
      </nav>
      <header className="workspace-hero">
        <div>
          <p className="eyebrow">PRIVATE WORKSPACE · AUTHENTICATED ACCOUNT DATA</p>
          <h1>Welcome back{user.displayName ? `, ${user.displayName}` : ""}.</h1>
          <p>
            Every record below is selected with the authenticated account ID on the server. Browser
            input cannot choose another owner.
          </p>
        </div>
        <div className="workspace-account">
          <span>AUTHORIZED GITHUB ID</span>
          <strong>{user.providerAccountId}</strong>
          <small>{user.email ?? "Email not provided"}</small>
        </div>
      </header>

      <section className="workspace-metrics" aria-label="Private workspace totals">
        <Metric label="Leagues" value={overview.leagues.length} />
        <Metric label="Scoring profiles" value={overview.scoringProfiles.length} />
        <Metric label="Draft sessions" value={overview.drafts.length} />
        <Metric
          label="Saved queues"
          value={sum(overview.drafts.map((draft) => draft.queuedPlayerCount))}
        />
        <Metric label="Saved rankings" value={overview.rankings.length} />
        <Metric label="Trade evaluations" value={overview.tradeEvaluations.length} />
      </section>

      <section className="workspace-section" id="leagues" aria-labelledby="leagues-heading">
        <p className="section-kicker">League configuration</p>
        <h2 id="leagues-heading">Linked and manual leagues</h2>
        {overview.leagues.length ? (
          <div className="workspace-card-grid">
            {overview.leagues.map((league) => (
              <article className="workspace-record-card" key={league.id}>
                <span>{providerLabel(league.provider)}</span>
                <h3>{league.name}</h3>
                <p>{league.teamCount} teams</p>
                <small>
                  {league.provider === "sleeper"
                    ? "Linked Sleeper league"
                    : league.provider === "espn"
                      ? "Manual ESPN league profile"
                      : "Manual league profile"}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="No saved leagues yet. Use the gateway below to normalize a Sleeper or manual ESPN profile." />
        )}
        {overview.scoringProfiles.length ? (
          <div className="workspace-compact-list">
            {overview.scoringProfiles.map((profile) => (
              <div key={profile.id}>
                <strong>{profile.name}</strong>
                <span>
                  {profile.leagueName} · version {profile.version}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No saved scoring profiles yet." />
        )}
      </section>

      <section className="workspace-section" id="saved-work" aria-labelledby="saved-heading">
        <p className="section-kicker">Private records</p>
        <h2 id="saved-heading">Saved work</h2>
        <div className="workspace-saved-grid">
          <SavedCollection
            title="Expert imports"
            empty="No private expert imports."
            items={overview.expertImports.map((item) => ({
              id: item.id,
              title: item.fileName,
              detail: `${item.providerName ?? "Private file"} · ${label(item.status)}`
            }))}
          />
          <SavedCollection
            title="Rankings"
            empty="No private ranking runs."
            items={overview.rankings.map((item) => ({
              id: item.id,
              title: `${label(item.kind)} rankings`,
              detail: `${item.version} · ${formatDate(item.generatedAt)}`
            }))}
          />
          <SavedCollection
            title="Draft sessions and queues"
            empty="No saved draft sessions."
            items={overview.drafts.map((item) => ({
              id: item.id,
              title: item.leagueName,
              detail: `${label(item.status)} · ${item.queuedPlayerCount} queued · ${formatDate(item.updatedAt)}`
            }))}
          />
          <SavedCollection
            title="Trade evaluations"
            empty="No saved trade evaluations."
            items={overview.tradeEvaluations.map((item) => ({
              id: item.id,
              title: `${label(item.status)} evaluation`,
              detail: formatDate(item.updatedAt)
            }))}
          />
        </div>
      </section>

      <section className="workspace-section" id="settings" aria-labelledby="settings-heading">
        <p className="section-kicker">Personal settings</p>
        <h2 id="settings-heading">Workspace defaults</h2>
        <form className="workspace-settings-form" action={updateWorkspacePreferences}>
          <label>
            <span>Default league</span>
            <select
              name="defaultLeagueId"
              defaultValue={overview.preferences.defaultLeagueId ?? ""}
            >
              <option value="">No default league</option>
              {overview.leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Default scoring</span>
            <select
              name="defaultScoringFormat"
              defaultValue={overview.preferences.defaultScoringFormat}
            >
              <option value="standard">Standard</option>
              <option value="half-ppr">Half PPR</option>
              <option value="ppr">Full PPR</option>
            </select>
          </label>
          <label>
            <span>Timezone</span>
            <select name="timezone" defaultValue={overview.preferences.timezone}>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
            </select>
          </label>
          <label className="workspace-checkbox">
            <input
              type="checkbox"
              name="compactRankings"
              defaultChecked={overview.preferences.compactRankings}
            />
            <span>Use compact ranking tables</span>
          </label>
          <button type="submit">Save personal settings</button>
        </form>
      </section>

      <section className="workspace-section" id="refresh-status" aria-labelledby="refresh-heading">
        <p className="section-kicker">Data refresh status</p>
        <h2 id="refresh-heading">Private dataset health</h2>
        {overview.dataRefreshes.length ? (
          <div className="workspace-compact-list">
            {overview.dataRefreshes.map((refresh) => (
              <div key={refresh.id}>
                <strong>{refresh.sourceName}</strong>
                <span>
                  {refresh.version} · {label(refresh.freshnessStatus)} ·{" "}
                  {formatDate(refresh.retrievedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message="No private dataset refreshes have completed yet." />
        )}
      </section>

      <LeagueGatewayPanel defaultSeason={currentSeason} />
      <DraftRoomPanel />
      <TradeAnalyzerPanel
        input={TRADE_DEMO_INPUT}
        allowSave
        fixtureLabel="Synthetic workflow fixture - saved evaluations remain private"
      />
      <ExpertImportPanel expertStatus={expertStatus} defaultSeason={currentSeason} />
      <SignOutButton />
    </main>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{metricLabel}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="workspace-empty">{message}</p>;
}

function SavedCollection({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: readonly { id: string; title: string; detail: string }[];
}) {
  return (
    <article className="workspace-saved-card">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </article>
  );
}

function providerLabel(provider: string | null) {
  if (provider === "sleeper") return "SLEEPER";
  if (provider === "espn") return "ESPN MANUAL";
  return "MANUAL";
}

function label(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").toUpperCase();
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}
