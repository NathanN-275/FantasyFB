"use client";

import { useState, type FormEvent } from "react";

type ImportKind = "projection" | "ranking" | "combined";

interface PreviewRow {
  rowNumber: number;
  resolution: "matched" | "ambiguous" | "missing" | "invalid";
  sourceIdentity: Readonly<Record<string, string>>;
  errors: readonly string[];
}

interface ImportPreview {
  id: string;
  fileName: string;
  totalRows: number;
  matchedRows: number;
  ambiguousRows: number;
  missingRows: number;
  invalidRows: number;
  rows: readonly PreviewRow[];
}

interface ExpertStatus {
  provider: string;
  expertApiEnabled: boolean;
  showModelRank: true;
  showModelProjection: true;
  showExpertRank: boolean;
  showExpertProjection: boolean;
  explanation?: string;
}

export function ExpertImportPanel({
  expertStatus,
  defaultSeason
}: {
  expertStatus: ExpertStatus;
  defaultSeason: number;
}) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function previewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    setPreview(undefined);
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind")) as ImportKind;
    const columns = {
      fullName: String(form.get("fullNameColumn")),
      team: String(form.get("teamColumn")),
      position: String(form.get("positionColumn")),
      ...(kind === "ranking" || kind === "combined"
        ? { overallRank: String(form.get("rankColumn")) }
        : {}),
      ...(kind === "projection" || kind === "combined"
        ? { projectedPoints: String(form.get("pointsColumn")) }
        : {})
    };
    form.set("profile", JSON.stringify({ kind, columns }));
    form.set("preserveOriginal", form.get("preserveOriginal") === "on" ? "true" : "false");
    try {
      const response = await fetch("/api/private/expert-imports", { method: "POST", body: form });
      const result = (await response.json()) as { preview?: ImportPreview; error?: string };
      if (!response.ok || !result.preview)
        throw new Error(result.error ?? "Import preview failed.");
      setPreview(result.preview);
      setMessage("Preview ready. Review every unresolved row before confirming.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/private/expert-imports/${encodeURIComponent(preview.id)}/confirm`,
        { method: "POST" }
      );
      const result = (await response.json()) as {
        import?: {
          persistedProjectionCount: number;
          persistedRankingCount: number;
          skippedRowCount: number;
        };
        error?: string;
      };
      if (!response.ok || !result.import) {
        throw new Error(result.error ?? "Import confirmation failed.");
      }
      setMessage(
        `Import confirmed: ${result.import.persistedProjectionCount} projections and ${result.import.persistedRankingCount} rankings saved; ${result.import.skippedRowCount} unresolved rows skipped.`
      );
      setPreview(undefined);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function previewAuthorizedApi() {
    setBusy(true);
    setMessage(undefined);
    setPreview(undefined);
    try {
      const response = await fetch("/api/private/expert-imports/authorized", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonYear: defaultSeason })
      });
      const result = (await response.json()) as { preview?: ImportPreview; error?: string };
      if (!response.ok || !result.preview) {
        throw new Error(result.error ?? "Authorized expert import failed.");
      }
      setPreview(result.preview);
      setMessage("Authorized API preview ready. Confirm to persist matched records.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authorized expert import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section aria-labelledby="expert-status-heading">
        <p className="eyebrow">DATA AVAILABILITY</p>
        <h2 id="expert-status-heading">Ranking and projection fields</h2>
        <ul className="status-list">
          <li>Model Rank: shown when model output exists</li>
          <li>Model Projection: shown when model output exists</li>
          {expertStatus.showExpertRank ? <li>Expert Rank: available</li> : null}
          {expertStatus.showExpertProjection ? <li>Expert Projection: available</li> : null}
        </ul>
        {expertStatus.explanation ? <p role="status">{expertStatus.explanation}</p> : null}
        {expertStatus.expertApiEnabled ? (
          <button type="button" onClick={previewAuthorizedApi} disabled={busy}>
            Preview authorized API import
          </button>
        ) : null}
      </section>

      <section aria-labelledby="expert-import-heading">
        <p className="eyebrow">PRIVATE DATA</p>
        <h2 id="expert-import-heading">Import expert CSV</h2>
        <p>
          CSV files are parsed on the server. A preview is required before matched records can be
          persisted. Ambiguous, missing, and invalid players are reported and skipped.
        </p>
        <form className="import-form" onSubmit={previewImport}>
          <label>
            CSV file
            <input name="file" type="file" accept=".csv,text/csv" required />
          </label>
          <label>
            Season
            <input
              name="seasonYear"
              type="number"
              min="2007"
              max="2100"
              defaultValue={defaultSeason}
              required
            />
          </label>
          <label>
            Provider name
            <input name="providerName" defaultValue="private-expert" required />
          </label>
          <label>
            Import type
            <select name="kind" defaultValue="combined">
              <option value="combined">Rankings and projections</option>
              <option value="ranking">Rankings</option>
              <option value="projection">Projections</option>
            </select>
          </label>
          <fieldset>
            <legend>CSV column mapping</legend>
            <label>
              Player name
              <input name="fullNameColumn" defaultValue="player_name" required />
            </label>
            <label>
              Team
              <input name="teamColumn" defaultValue="team" />
            </label>
            <label>
              Position
              <input name="positionColumn" defaultValue="position" />
            </label>
            <label>
              Overall rank
              <input name="rankColumn" defaultValue="rank" />
            </label>
            <label>
              Projected points
              <input name="pointsColumn" defaultValue="projected_points" />
            </label>
          </fieldset>
          <label className="checkbox-label">
            <input name="preserveOriginal" type="checkbox" />
            Preserve the original CSV privately after confirmation
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Working…" : "Create preview"}
          </button>
        </form>

        {message ? <p role="status">{message}</p> : null}
        {preview ? (
          <div className="preview">
            <h3>{preview.fileName}</h3>
            <p>
              {preview.matchedRows} matched · {preview.ambiguousRows} ambiguous ·{" "}
              {preview.missingRows} missing · {preview.invalidRows} invalid
            </p>
            <div className="table-scroll">
              <table>
                <caption>Private expert import preview</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Player</th>
                    <th scope="col">Team</th>
                    <th scope="col">Position</th>
                    <th scope="col">Resolution</th>
                    <th scope="col">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.sourceIdentity.fullName}</td>
                      <td>{row.sourceIdentity.team ?? "—"}</td>
                      <td>{row.sourceIdentity.position ?? "—"}</td>
                      <td>{row.resolution}</td>
                      <td>{row.errors.join("; ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={confirmImport} disabled={busy}>
              Confirm and save matched records
            </button>
          </div>
        ) : null}
      </section>

      <AdpSnapshotPanel defaultSeason={defaultSeason} />
    </>
  );
}

function AdpSnapshotPanel({ defaultSeason }: { defaultSeason: number }) {
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function refresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/private/adp/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seasonYear: Number(form.get("seasonYear")),
          scoringFormat: form.get("scoringFormat"),
          leagueSize: Number(form.get("leagueSize"))
        })
      });
      const result = (await response.json()) as {
        snapshot?: {
          persistedRecordCount: number;
          unresolvedRecordCount: number;
          retrievedAt: string;
          reused: boolean;
        };
        error?: string;
      };
      if (!response.ok || !result.snapshot) {
        throw new Error(result.error ?? "ADP snapshot failed.");
      }
      setMessage(
        result.snapshot.reused
          ? `The current daily snapshot already exists with ${result.snapshot.persistedRecordCount} records.`
          : `Saved ${result.snapshot.persistedRecordCount} ADP records; ${result.snapshot.unresolvedRecordCount} provider players were unresolved.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ADP snapshot failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="adp-heading">
      <p className="eyebrow">DRAFT MARKET</p>
      <h2 id="adp-heading">Capture ADP snapshot</h2>
      <p>
        Each retrieval creates a new attributed snapshot. The provider updates daily, so refresh at
        most once per day for a scoring and league-size combination.
      </p>
      <form className="import-form compact-form" onSubmit={refresh}>
        <label>
          Season
          <input
            name="seasonYear"
            type="number"
            defaultValue={defaultSeason}
            min="2007"
            max="2100"
          />
        </label>
        <label>
          Scoring
          <select name="scoringFormat" defaultValue="ppr">
            <option value="standard">Standard</option>
            <option value="half-ppr">Half PPR</option>
            <option value="ppr">PPR</option>
            <option value="2qb">2QB</option>
            <option value="dynasty">Dynasty</option>
            <option value="rookie">Rookie</option>
          </select>
        </label>
        <label>
          League size
          <input name="leagueSize" type="number" defaultValue="12" min="2" max="32" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Capturing…" : "Capture snapshot"}
        </button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      <p className="attribution">
        ADP data:{" "}
        <a href="https://fantasyfootballcalculator.com" rel="noreferrer">
          Fantasy Football Calculator
        </a>
      </p>
    </section>
  );
}
