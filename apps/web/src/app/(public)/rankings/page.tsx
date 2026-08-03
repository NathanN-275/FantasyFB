import Link from "next/link";
import { BoundaryDisclosure, PublicNavigation } from "../../../components/public-demo-shell";
import { samplePlayerIntelligence } from "../../../server/sample-player-intelligence";
import { loadPublicDemoFixtures } from "../../../fixtures/public-demo";

export default function PublicRankingsPage() {
  const demo = loadPublicDemoFixtures();
  const directory = samplePlayerIntelligence.directory({ sort: "modelRank", direction: "asc" });
  return (
    <main className="research-shell public-overview-shell">
      <PublicNavigation />
      <header className="directory-hero">
        <div>
          <p className="eyebrow">{demo.label}</p>
          <h1>Sample rankings</h1>
          <p className="hero-copy">
            Model, expert, hybrid, and market context from the synthetic player portfolio. Private
            expert imports never contribute to this board.
          </p>
        </div>
        <div className="season-stamp">
          <span>PLAYERS</span>
          <strong>{directory.total}</strong>
          <small>FIXTURE BOARD</small>
        </div>
      </header>
      <section className="player-table-wrap">
        <table className="player-table">
          <caption>Public sample ranking comparison</caption>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Player</th>
              <th scope="col">Position</th>
              <th scope="col">Expert</th>
              <th scope="col">Hybrid</th>
              <th scope="col">ADP</th>
              <th scope="col">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {directory.players.map((player) => (
              <tr key={player.id}>
                <td className="rank-cell">{player.modelRank ?? "NR"}</td>
                <th scope="row">
                  <Link className="player-link" href={`/players/${player.slug}`}>
                    {player.fullName}
                  </Link>
                </th>
                <td>{player.position}</td>
                <td>{player.expertRank ?? "—"}</td>
                <td>{player.hybridRank ?? "—"}</td>
                <td>{player.adp?.toFixed(1) ?? "—"}</td>
                <td>
                  {player.confidence === undefined
                    ? "—"
                    : `${Math.round(player.confidence * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <BoundaryDisclosure />
    </main>
  );
}
