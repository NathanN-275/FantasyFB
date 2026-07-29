"use client";

import {
  createTradeEngine,
  type TradeEngineInput,
  type TradeEvaluation,
  type TradePackageTotals,
  type TradeRosterImpact
} from "@fantasyfb/trade-engine";
import { useMemo, useState } from "react";
import styles from "./trade-analyzer-panel.module.css";

interface TradeAnalyzerPanelProps {
  readonly input: TradeEngineInput;
  readonly allowSave?: boolean;
  readonly fixtureLabel?: string;
}

function points(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function plainPoints(value: number) {
  return value.toFixed(1);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function PackageSummary({
  label,
  totals
}: {
  readonly label: string;
  readonly totals: TradePackageTotals;
}) {
  return (
    <article className={styles.packageCard}>
      <p className={styles.kicker}>{label}</p>
      <h3>{totals.playerIds.length}-player package</h3>
      <dl className={styles.metricGrid}>
        <div>
          <dt>Raw projection</dt>
          <dd>{plainPoints(totals.rawPlayerValue)}</dd>
        </div>
        <div>
          <dt>Above replacement</dt>
          <dd>{plainPoints(totals.replacementValue)}</dd>
        </div>
        <div>
          <dt>Floor / ceiling</dt>
          <dd>
            {plainPoints(totals.floor)} / {plainPoints(totals.ceiling)}
          </dd>
        </div>
        <div>
          <dt>Risk / confidence</dt>
          <dd>
            {percent(totals.risk)} / {percent(totals.confidence)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function LineupTable({ impact }: { readonly impact: TradeRosterImpact }) {
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption>{impact.rosterName} optimized starting lineup</caption>
        <thead>
          <tr>
            <th scope="col">Slot</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {impact.beforeStartingLineup.map((before, index) => {
            const after = impact.afterStartingLineup[index];
            return (
              <tr key={before.slot}>
                <th scope="row">{before.slot}</th>
                <td>
                  {before.playerName}
                  <span>{plainPoints(before.projectedPoints)}</span>
                </td>
                <td>
                  {after?.playerName ?? "Open lineup slot"}
                  <span>{plainPoints(after?.projectedPoints ?? 0)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RosterImpact({ impact }: { readonly impact: TradeRosterImpact }) {
  return (
    <article className={styles.impactCard}>
      <div className={styles.impactHeading}>
        <div>
          <p className={styles.kicker}>ROSTER IMPACT</p>
          <h3>{impact.rosterName}</h3>
        </div>
        <strong
          className={impact.rosterContextValue >= 0 ? styles.positive : styles.negative}
          aria-label={`${points(impact.rosterContextValue)} roster context value`}
        >
          {points(impact.rosterContextValue)}
        </strong>
      </div>
      <dl className={styles.metricGrid}>
        <div>
          <dt>Starting lineup</dt>
          <dd>{points(impact.startingLineupValue)}</dd>
        </div>
        <div>
          <dt>Bench value</dt>
          <dd>{points(impact.benchValue)}</dd>
        </div>
        <div>
          <dt>Short term</dt>
          <dd>{points(impact.shortTermOutlook)}</dd>
        </div>
        <div>
          <dt>Full season</dt>
          <dd>{points(impact.fullSeasonOutlook)}</dd>
        </div>
        <div>
          <dt>Best plausible</dt>
          <dd>{points(impact.bestPlausibleOutcome)}</dd>
        </div>
        <div>
          <dt>Worst plausible</dt>
          <dd>{points(impact.worstPlausibleOutcome)}</dd>
        </div>
      </dl>
      <p className={styles.rosterPoints}>
        Projected roster points: {plainPoints(impact.beforeProjectedRosterPoints.total)} before →{" "}
        {plainPoints(impact.afterProjectedRosterPoints.total)} after (
        {points(impact.projectedRosterPointDelta)})
      </p>
      <LineupTable impact={impact} />
      <details className={styles.details}>
        <summary>Position, bench, and replacement details</summary>
        <div className={styles.tableWrap}>
          <table>
            <caption>{impact.rosterName} positional effects</caption>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Roster count</th>
                <th scope="col">Starter change</th>
              </tr>
            </thead>
            <tbody>
              {impact.positionalEffects.map((effect) => (
                <tr key={effect.position}>
                  <th scope="row">{effect.position}</th>
                  <td>
                    {effect.beforeRosterCount} → {effect.afterRosterCount}
                  </td>
                  <td>{points(effect.starterDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Bench: {impact.beforeBenchPlayerIds.length} before, {impact.afterBenchPlayerIds.length}{" "}
          after. Replacements added: {impact.addedReplacementPlayers.length}. Modeled drops:{" "}
          {impact.droppedPlayerIds.length}.
        </p>
        <p>
          Consolidation effect beyond raw package difference:{" "}
          {points(impact.packageConsolidationValue)}. Risk: {percent(impact.riskBefore)} →{" "}
          {percent(impact.riskAfter)}.
        </p>
      </details>
    </article>
  );
}

export function TradeAnalyzerPanel({
  input,
  allowSave = false,
  fixtureLabel
}: TradeAnalyzerPanelProps) {
  const engine = useMemo(() => createTradeEngine(), []);
  const [selection, setSelection] = useState({
    sideA: [...input.trade.sideA.playerIds],
    sideB: [...input.trade.sideB.playerIds]
  });
  const [evaluation, setEvaluation] = useState<TradeEvaluation>(() => engine.evaluate(input));
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const players = useMemo(
    () => new Map(input.players.map((player) => [player.playerId, player])),
    [input.players]
  );
  const rosters = useMemo(
    () => new Map(input.currentRosters.map((roster) => [roster.rosterId, roster])),
    [input.currentRosters]
  );
  const activeInput = useMemo(
    () => ({
      ...input,
      trade: {
        sideA: { ...input.trade.sideA, playerIds: selection.sideA },
        sideB: { ...input.trade.sideB, playerIds: selection.sideB }
      }
    }),
    [input, selection]
  );

  function toggle(side: "sideA" | "sideB", playerId: string) {
    setSelection((current) => {
      const selected = current[side];
      if (selected.includes(playerId) && selected.length === 1) return current;
      return {
        ...current,
        [side]: selected.includes(playerId)
          ? selected.filter((id) => id !== playerId)
          : [...selected, playerId]
      };
    });
  }

  function analyze() {
    try {
      setEvaluation(engine.evaluate(activeInput));
      setMessage("Trade re-evaluated with the selected packages.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade evaluation failed.");
    }
  }

  async function save() {
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch("/api/private/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(activeInput)
      });
      const result = (await response.json()) as { evaluation?: { id: string }; error?: string };
      if (!response.ok || !result.evaluation) {
        throw new Error(result.error ?? "Trade evaluation could not be saved.");
      }
      setMessage(`Saved private evaluation ${result.evaluation.id}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Trade evaluation could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const sideARoster = rosters.get(input.trade.sideA.rosterId);
  const sideBRoster = rosters.get(input.trade.sideB.rosterId);

  return (
    <section className={styles.analyzer} aria-labelledby="trade-analyzer-heading">
      <div className={styles.intro}>
        <div>
          <p className={styles.kicker}>DEEP ROSTER ANALYSIS</p>
          <h2 id="trade-analyzer-heading">Build a multi-player trade</h2>
          <p>
            Compare optimized lineups, bench value, replacements, scarcity, schedule, injuries,
            uncertainty, and roster fit—without a mystery trade-chart score.
          </p>
        </div>
        <div className={styles.modeBadge}>
          <span>MODE</span>
          <strong>{evaluation.mode === "generic" ? "GENERIC" : "LEAGUE"}</strong>
          <small>{evaluation.assumptions.teamCount} teams</small>
        </div>
      </div>

      <div className={styles.assumptionBar}>
        {fixtureLabel ? <strong>{fixtureLabel}</strong> : null}
        <strong>
          {evaluation.mode === "generic"
            ? "No league selected—generic configurable assumptions are active."
            : evaluation.assumptions.leagueName}
        </strong>
        <span>{evaluation.assumptions.scoringConfigurationIdentifier}</span>
        <span>{evaluation.assumptions.shortTermWeeks}-week outlook</span>
        <span>
          {evaluation.assumptions.rosterSettings.starterSlots.reduce(
            (total, slot) => total + slot.count,
            0
          )}{" "}
          starters
        </span>
      </div>

      <div className={styles.builderGrid}>
        {(
          [
            ["sideA", sideARoster, "SIDE A SENDS"],
            ["sideB", sideBRoster, "SIDE B SENDS"]
          ] as const
        ).map(([side, roster, label]) => (
          <fieldset className={styles.rosterPicker} key={side}>
            <legend>
              {label}: {roster?.rosterName}
            </legend>
            {roster?.playerIds.map((playerId) => {
              const player = players.get(playerId);
              if (!player) return null;
              return (
                <label key={playerId}>
                  <input
                    type="checkbox"
                    checked={selection[side].includes(playerId)}
                    onChange={() => toggle(side, playerId)}
                    aria-label={`Include ${player.playerName} from ${label}`}
                  />
                  <span>
                    <strong>{player.playerName}</strong>
                    <small>
                      {player.position} · {player.nflTeam}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      <div className={styles.actions}>
        <button type="button" onClick={analyze}>
          Analyze selected packages
        </button>
        {allowSave ? (
          <button type="button" className={styles.secondaryButton} onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save privately"}
          </button>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </div>

      <div className={styles.packageGrid}>
        <PackageSummary label="SIDE A OFFERS" totals={evaluation.packages.sideA} />
        <PackageSummary label="SIDE B OFFERS" totals={evaluation.packages.sideB} />
      </div>

      <div className={styles.impactGrid}>
        <RosterImpact impact={evaluation.rosterImpacts.sideA} />
        <RosterImpact impact={evaluation.rosterImpacts.sideB} />
      </div>

      <section className={styles.explanation} aria-labelledby="trade-explanation-heading">
        <div>
          <p className={styles.kicker}>INTERPRETATION</p>
          <h3 id="trade-explanation-heading">What changes—and why</h3>
          <ol>
            {evaluation.explanation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <aside>
          <h4>Assumptions</h4>
          <p>
            Replacement levels: RB {evaluation.assumptions.replacementLevels.RB}, WR{" "}
            {evaluation.assumptions.replacementLevels.WR}, TE{" "}
            {evaluation.assumptions.replacementLevels.TE}.
          </p>
          <p>
            Confidence {percent(evaluation.confidence)}. Lower-risk package:{" "}
            {evaluation.riskComparison.lowerRiskPackage.replace("side", "Side ")}.
          </p>
          {evaluation.missingDataWarnings.length ? (
            <>
              <h4>Missing-data warnings</h4>
              <ul>
                {evaluation.missingDataWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>No missing-data warnings for this synthetic evaluation.</p>
          )}
        </aside>
      </section>
    </section>
  );
}
