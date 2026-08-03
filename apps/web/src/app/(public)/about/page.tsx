import { BoundaryDisclosure, PublicNavigation } from "../../../components/public-demo-shell";
import { loadPublicDemoFixtures } from "../../../fixtures/public-demo";

const repositoryUrl = "https://github.com/NathanN-275/FantasyFB";

export default function PublicAboutPage() {
  const demo = loadPublicDemoFixtures();
  return (
    <main className="research-shell public-overview-shell">
      <PublicNavigation current="About" />
      <header className="directory-hero">
        <div>
          <p className="eyebrow">{demo.label}</p>
          <h1>Transparent by design.</h1>
          <p className="hero-copy">
            The architecture, projection method, and source rules are part of the product - not
            hidden implementation details.
          </p>
        </div>
      </header>
      <section className="public-doc-section" aria-labelledby="architecture-heading">
        <p className="section-kicker">Architecture overview</p>
        <h2 id="architecture-heading">One domain, two data boundaries</h2>
        <div className="architecture-stack">
          {demo.architecture.map((item) => (
            <article key={item.layer}>
              <h3>{item.layer}</h3>
              <p>{item.responsibility}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="public-doc-section" aria-labelledby="method-heading">
        <p className="section-kicker">Projection methodology</p>
        <h2 id="method-heading">Version the evidence, explain the output</h2>
        <ol className="method-list">
          {demo.methodology.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="public-doc-section" aria-labelledby="sources-heading">
        <p className="section-kicker">Data-source documentation</p>
        <h2 id="sources-heading">Conservative inputs with visible terms</h2>
        <div className="source-card-grid">
          {demo.sources.map((source) => (
            <article key={source.name}>
              <h3>
                <a href={source.href}>{source.name}</a>
              </h3>
              <p>{source.usage}</p>
            </article>
          ))}
        </div>
        <p>
          Full architecture, methodology, source notes, migrations, and tests live in the{" "}
          <a className="text-link" href={repositoryUrl}>
            public GitHub repository
          </a>
          .
        </p>
      </section>
      <BoundaryDisclosure />
    </main>
  );
}
