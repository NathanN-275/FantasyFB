import { BoundaryDisclosure, PublicNavigation } from "../../../components/public-demo-shell";
import { loadPublicDemoFixtures } from "../../../fixtures/public-demo";

export default function LeagueDemoPage() {
  const { label, league } = loadPublicDemoFixtures();
  return (
    <main className="research-shell public-overview-shell">
      <PublicNavigation />
      <header className="directory-hero">
        <div>
          <p className="eyebrow">{label}</p>
          <h1>{league.name}</h1>
          <p className="hero-copy">
            A fictional league profile demonstrates roster context without exposing a real manager,
            provider account, league identifier, or scoring import.
          </p>
        </div>
        <div className="season-stamp">
          <span>SEASON</span>
          <strong>{league.season}</strong>
          <small>{league.teamCount}-TEAM SAMPLE</small>
        </div>
      </header>
      <section className="sample-league-summary" aria-label="Sample league configuration">
        <article>
          <p className="section-kicker">Scoring</p>
          <h2>{league.scoring}</h2>
          <p>Provider: dedicated fixture loader</p>
        </article>
        <article>
          <p className="section-kicker">Roster</p>
          <h2>{league.roster.length} slot groups</h2>
          <p>{league.roster.join(" · ")}</p>
        </article>
      </section>
      <section className="player-table-wrap" aria-labelledby="standings-heading">
        <table className="player-table">
          <caption id="standings-heading">Synthetic sample standings</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Team</th>
              <th scope="col">Manager</th>
              <th scope="col">Record</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {league.teams.map((team, index) => (
              <tr key={team.name}>
                <td className="rank-cell">{index + 1}</td>
                <th scope="row">{team.name}</th>
                <td>{team.manager}</td>
                <td>{team.record}</td>
                <td>{team.points.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <BoundaryDisclosure />
    </main>
  );
}
