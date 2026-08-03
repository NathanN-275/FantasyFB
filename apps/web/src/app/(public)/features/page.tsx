import Link from "next/link";
import { BoundaryDisclosure, PublicNavigation } from "../../../components/public-demo-shell";
import { loadPublicDemoFixtures } from "../../../fixtures/public-demo";

export default function PublicFeaturesPage() {
  const demo = loadPublicDemoFixtures();
  return (
    <main className="research-shell public-overview-shell">
      <PublicNavigation current="Features" />
      <header className="directory-hero">
        <div>
          <p className="eyebrow">{demo.label}</p>
          <h1>See the whole board.</h1>
          <p className="hero-copy">
            Explore the product with fictional league and player data. Nothing on these routes comes
            from an authenticated account.
          </p>
        </div>
        <div className="season-stamp" aria-label="Public demo fixture status">
          <span>FIXTURE</span>
          <strong>SAFE</strong>
          <small>{demo.fixtureId}</small>
        </div>
      </header>
      <section className="public-feature-grid" aria-label="Public product features">
        {demo.features.map((feature, index) => (
          <article key={feature.href}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
            <Link className="text-link" href={feature.href}>
              Open sample
            </Link>
          </article>
        ))}
      </section>
      <BoundaryDisclosure />
    </main>
  );
}
