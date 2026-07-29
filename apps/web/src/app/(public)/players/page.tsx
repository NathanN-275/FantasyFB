import type {
  DirectorySort,
  InjuryStatus,
  PlayerIntelligenceDirectoryQuery,
  PlayerPosition,
  RankingKind
} from "@fantasyfb/player-intelligence";
import Link from "next/link";
import { ResponsiveFilterPanel } from "../../../components/responsive-filter-panel";
import { samplePlayerIntelligence } from "../../../server/sample-player-intelligence";

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_LABELS: Record<DirectorySort, string> = {
  modelRank: "Model rank",
  name: "Player",
  projection: "Projection",
  adp: "ADP",
  risk: "Risk",
  confidence: "Confidence"
};

export default async function PlayerDirectoryPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const options = samplePlayerIntelligence.directory().filters;
  const query = parseDirectoryQuery(rawParams, options);
  const currentSort = query.sort ?? "modelRank";
  const currentDirection =
    query.direction ??
    (["name", "modelRank", "adp", "risk"].includes(currentSort) ? "asc" : "desc");
  const directory = samplePlayerIntelligence.directory({
    ...query,
    direction: currentDirection
  });

  return (
    <main className="research-shell">
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link aria-current="page" href="/players">
            Players
          </Link>
          <Link href="/news">News</Link>
          <Link href="/draft-demo">Draft demo</Link>
          <Link href="/sign-in">Private workspace</Link>
        </div>
      </nav>

      <header className="directory-hero">
        <div>
          <p className="eyebrow">{directory.label}</p>
          <h1>Player intelligence</h1>
          <p className="hero-copy">
            One research board for projections, ranks, market value, risk, and the evidence behind
            every number.
          </p>
        </div>
        <div className="season-stamp" aria-label={`${directory.season} preseason research board`}>
          <span>SEASON</span>
          <strong>{directory.season}</strong>
          <small>PRESEASON BOARD</small>
        </div>
      </header>

      <ResponsiveFilterPanel
        resultLabel={`${directory.total} ${directory.total === 1 ? "player" : "players"}`}
      >
        <div className="filter-heading-row">
          <div>
            <p className="section-kicker">Research controls</p>
            <h2 id="filter-heading">Find your draft target</h2>
          </div>
          <span className="result-count" aria-live="polite">
            {directory.total} {directory.total === 1 ? "player" : "players"}
          </span>
        </div>

        <form className="player-filters" action="/players" role="search">
          <label className="search-field">
            <span>Search players or teams</span>
            <input
              type="search"
              name="q"
              defaultValue={query.search}
              placeholder="Try Marcus or Seattle"
            />
          </label>
          <label>
            <span>Position</span>
            <select name="position" defaultValue={query.positions?.[0] ?? ""}>
              <option value="">All positions</option>
              {options.positions.map((position) => (
                <option key={position}>{position}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Team</span>
            <select name="team" defaultValue={query.teams?.[0] ?? ""}>
              <option value="">All teams</option>
              {options.teams.map((team) => (
                <option key={team.abbreviation} value={team.abbreviation}>
                  {team.abbreviation}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Bye week</span>
            <select name="bye" defaultValue={query.byeWeeks?.[0]?.toString() ?? ""}>
              <option value="">Any week</option>
              {options.byeWeeks.map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ranking data</span>
            <select name="ranking" defaultValue={query.rankingKinds?.[0] ?? ""}>
              <option value="">Any ranking</option>
              {options.rankingKinds.map((kind) => (
                <option key={kind} value={kind}>
                  Has {kind} rank
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Injury status</span>
            <select name="injury" defaultValue={query.injuryStatuses?.[0] ?? ""}>
              <option value="">Any status</option>
              {options.injuryStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select name="sort" defaultValue={currentSort}>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="direction" value={currentDirection} />
          <div className="filter-actions">
            <button type="submit">Apply filters</button>
            <Link className="text-link" href="/players">
              Reset
            </Link>
          </div>
        </form>
      </ResponsiveFilterPanel>

      {directory.players.length ? (
        <>
          <div className="player-table-wrap">
            <table className="player-table">
              <caption>
                {directory.season} player research board, updated{" "}
                {directory.asOf.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC"
                })}
              </caption>
              <thead>
                <tr>
                  <SortableHeading
                    field="modelRank"
                    label="Model"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                  <SortableHeading
                    field="name"
                    label="Player"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                  <th scope="col">Status</th>
                  <th scope="col">Bye</th>
                  <SortableHeading
                    field="projection"
                    label="Proj"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                  <th scope="col">Expert</th>
                  <th scope="col">Hybrid</th>
                  <SortableHeading
                    field="adp"
                    label="ADP"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                  <SortableHeading
                    field="risk"
                    label="Risk"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                  <SortableHeading
                    field="confidence"
                    label="Conf"
                    currentSort={currentSort}
                    currentDirection={currentDirection}
                    rawParams={rawParams}
                  />
                </tr>
              </thead>
              <tbody>
                {directory.players.map((player) => (
                  <tr key={player.id}>
                    <td className="rank-cell">{formatNumber(player.modelRank, "NR")}</td>
                    <th scope="row">
                      <Link className="player-link" href={`/players/${player.slug}`}>
                        <span className="player-avatar" aria-hidden="true">
                          {initials(player.fullName)}
                        </span>
                        <span>
                          <strong>{player.fullName}</strong>
                          <small>
                            {player.team.abbreviation} · {player.position}
                          </small>
                        </span>
                      </Link>
                    </th>
                    <td>
                      <StatusBadge status={player.injury.status} />
                    </td>
                    <td>{player.byeWeek}</td>
                    <td>{formatNumber(player.modelProjection, "—", 1)}</td>
                    <td>{formatNumber(player.expertRank)}</td>
                    <td>{formatNumber(player.hybridRank)}</td>
                    <td>{formatNumber(player.adp, "—", 1)}</td>
                    <td>
                      <span className={`risk-label risk-${player.risk.level}`}>
                        {formatLabel(player.risk.level)} {Math.round(player.risk.score)}
                      </span>
                    </td>
                    <td>{formatPercent(player.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="player-card-grid">
            {directory.players.map((player) => (
              <article className="player-card" key={player.id}>
                <div className="card-topline">
                  <span className="rank-number">#{formatNumber(player.modelRank, "NR")}</span>
                  <StatusBadge status={player.injury.status} />
                </div>
                <div className="card-identity">
                  <span className="player-avatar" aria-hidden="true">
                    {initials(player.fullName)}
                  </span>
                  <div>
                    <h2>{player.fullName}</h2>
                    <p>
                      {player.team.abbreviation} · {player.position} · Bye {player.byeWeek}
                    </p>
                  </div>
                </div>
                <dl className="card-metrics">
                  <div>
                    <dt>Projection</dt>
                    <dd>{formatNumber(player.modelProjection, "—", 1)}</dd>
                  </div>
                  <div>
                    <dt>ADP</dt>
                    <dd>{formatNumber(player.adp, "—", 1)}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{formatLabel(player.risk.level)}</dd>
                  </div>
                  <div>
                    <dt>Confidence</dt>
                    <dd>{formatPercent(player.confidence)}</dd>
                  </div>
                </dl>
                <Link className="card-link" href={`/players/${player.slug}`}>
                  Open full evaluation <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="empty-state" aria-labelledby="empty-heading">
          <p className="empty-mark" aria-hidden="true">
            0
          </p>
          <h2 id="empty-heading">No players match this board</h2>
          <p>Clear one or more filters to widen the research pool.</p>
          <Link className="button-link" href="/players">
            Reset the board
          </Link>
        </section>
      )}

      <aside className="sample-disclosure" aria-label="Sample data disclosure">
        <strong>Portfolio data, clearly separated.</strong>
        <p>
          Every player, statistic, projection, rank, headline, and status on this public board is
          synthetic. The private workspace uses separately authorized records.
        </p>
      </aside>
    </main>
  );
}

function SortableHeading({
  field,
  label,
  currentSort,
  currentDirection,
  rawParams
}: {
  field: DirectorySort;
  label: string;
  currentSort: DirectorySort;
  currentDirection: "asc" | "desc";
  rawParams: SearchParams;
}) {
  const active = currentSort === field;
  const nextDirection = active && currentDirection === "asc" ? "desc" : "asc";
  const params = toUrlSearchParams(rawParams);
  params.set("sort", field);
  params.set("direction", nextDirection);

  return (
    <th
      scope="col"
      aria-sort={active ? (currentDirection === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link className="sort-link" href={`/players?${params.toString()}`}>
        {label}
        <span aria-hidden="true">{active ? (currentDirection === "asc" ? " ↑" : " ↓") : ""}</span>
      </Link>
    </th>
  );
}

function StatusBadge({ status }: { status: InjuryStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true">{status === "healthy" ? "✓" : "!"}</span>
      {formatLabel(status)}
    </span>
  );
}

function parseDirectoryQuery(
  params: SearchParams,
  options: ReturnType<typeof samplePlayerIntelligence.directory>["filters"]
): PlayerIntelligenceDirectoryQuery {
  const position = first(params.position);
  const team = first(params.team);
  const bye = Number(first(params.bye));
  const ranking = first(params.ranking);
  const injury = first(params.injury);
  const sort = first(params.sort);
  const direction = first(params.direction);
  const positions = options.positions.includes(position as PlayerPosition)
    ? [position as PlayerPosition]
    : [];
  const teams = options.teams.some((option) => option.abbreviation === team) ? [team] : [];
  const byeWeeks = options.byeWeeks.includes(bye) ? [bye] : [];
  const rankingKinds = options.rankingKinds.includes(ranking as RankingKind)
    ? [ranking as RankingKind]
    : [];
  const injuryStatuses = options.injuryStatuses.includes(injury as InjuryStatus)
    ? [injury as InjuryStatus]
    : [];
  const validSort = Object.hasOwn(SORT_LABELS, sort) ? (sort as DirectorySort) : "modelRank";

  return {
    search: first(params.q),
    positions,
    teams,
    byeWeeks,
    rankingKinds,
    injuryStatuses,
    sort: validSort,
    ...(direction === "asc" || direction === "desc" ? { direction } : {})
  };
}

function toUrlSearchParams(params: SearchParams): URLSearchParams {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
    else if (value) result.set(key, value);
  });
  return result;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatNumber(value: number | undefined, fallback = "—", digits = 0): string {
  return value === undefined
    ? fallback
    : value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

function formatLabel(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}
