import Link from "next/link";
import { requireAuthorizedUser } from "../../../../server/auth/private-access";
import { getDataHealth } from "../../../../server/data-health";

export const dynamic = "force-dynamic";

export default async function DataHealthPage() {
  const user = await requireAuthorizedUser();
  const health = await getDataHealth(user);

  return (
    <main className="research-shell workspace-shell">
      <nav className="site-nav" aria-label="Data health navigation">
        <Link className="wordmark" href="/">
          FANTASY<span>FB</span>
        </Link>
        <div className="nav-links">
          <Link href="/workspace">Workspace</Link>
          <Link href="/">Public demo</Link>
        </div>
      </nav>

      <header className="workspace-hero">
        <div>
          <p className="eyebrow">PRIVATE OPERATIONS · AUTHORIZED ACCOUNT ONLY</p>
          <h1>Data health</h1>
          <p>
            Database connectivity, validated dataset versions, projection model metadata, and draft
            synchronization state. No provider payloads or credentials are displayed.
          </p>
        </div>
        <div className="workspace-account">
          <span>OVERALL STATUS</span>
          <strong>{health.status.toUpperCase()}</strong>
          <small>Checked {formatDate(health.checkedAt)}</small>
        </div>
      </header>

      {health.warning ? <p className="workspace-empty">{health.warning}</p> : null}

      <section className="workspace-metrics" aria-label="Operational health totals">
        <Metric label="Database latency" value={`${health.databaseLatencyMs ?? "—"} ms`} />
        <Metric label="Datasets" value={health.datasets.length} />
        <Metric label="Projection runs" value={health.projectionRuns.length} />
        <Metric label="Draft sessions" value={health.drafts.length} />
      </section>

      <HealthSection title="Dataset freshness">
        {health.datasets.length ? (
          health.datasets.map((dataset) => (
            <div key={dataset.id}>
              <strong>{dataset.sourceName}</strong>
              <span>
                {dataset.version} · {dataset.visibility} · {dataset.validationStatus} ·{" "}
                {dataset.freshnessStatus} · {dataset.recordCount} records ·{" "}
                {formatDate(dataset.retrievedAt)}
              </span>
            </div>
          ))
        ) : (
          <p className="workspace-empty">No visible dataset metadata is available.</p>
        )}
      </HealthSection>

      <HealthSection title="Projection model runs">
        {health.projectionRuns.length ? (
          health.projectionRuns.map((run) => (
            <div key={run.id}>
              <strong>
                {run.seasonYear} {run.kind}
              </strong>
              <span>
                model {run.modelVersion ?? "not recorded"} · features{" "}
                {run.featureVersion ?? "not recorded"} · {formatDate(run.generatedAt)}
              </span>
            </div>
          ))
        ) : (
          <p className="workspace-empty">No projection run metadata is available.</p>
        )}
      </HealthSection>

      <HealthSection title="Draft synchronization">
        {health.drafts.length ? (
          health.drafts.map((draft) => (
            <div key={draft.id}>
              <strong>{draft.provider ?? "manual"} draft</strong>
              <span>
                {draft.status} · last event{" "}
                {draft.lastEventReceivedAt ? formatDate(draft.lastEventReceivedAt) : "not received"}{" "}
                · state updated {formatDate(draft.updatedAt)}
              </span>
            </div>
          ))
        ) : (
          <p className="workspace-empty">No private draft sessions are available.</p>
        )}
      </HealthSection>
    </main>
  );
}

function HealthSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replaceAll(" ", "-");
  return (
    <section className="workspace-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="workspace-compact-list">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York"
  }).format(value);
}
