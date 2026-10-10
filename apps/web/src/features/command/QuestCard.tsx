// Incident quest card and its state machine. Big score with four labelled mini-bars (Water lost /
// Evidence / Critical site / Signals agree, each tooltipped with value + weight). Actions:
// Dispatch (or "Locate & repair" for hidden — both call dispatch) → en route (ETA blocks) → on site
// + Mark repaired → Verifying ▮▮▯ → VERIFIED banner. Dispatch disables with a reason when not allowed.
import type { JSX } from "react";
import type { IncidentView } from "../../state/view-types";
import { PixelButton } from "../../ui/PixelButton";
import { verdictWord } from "../../ui/words";
import styles from "./command.module.css";

const ARRIVAL_SLOTS = 2;
const VERIFY_SLOTS = 3;

function range(n: number): number[] {
  return [...Array(n).keys()];
}

const SCORE_BARS: { key: "W" | "E" | "C" | "K"; label: string; weight: number }[] = [
  { key: "W", label: "Water lost", weight: 40 },
  { key: "E", label: "Evidence", weight: 25 },
  { key: "C", label: "Critical site", weight: 20 },
  { key: "K", label: "Signals agree", weight: 15 },
];

export function QuestCard({
  incident,
  selected,
  busy,
  crewEtaSlots,
  dispatchDisabledReason,
  onDispatch,
  onRepair,
  onSelect,
}: {
  incident: IncidentView;
  selected: boolean;
  busy: boolean;
  crewEtaSlots: number;
  dispatchDisabledReason: string | null;
  onDispatch: () => void;
  onRepair: () => void;
  onSelect: () => void;
}): JSX.Element {
  const s = incident.score;
  const { status } = incident;
  const canDispatch = status === "open" || status === "reopened";
  const enRoute = status === "dispatched";
  const onSite = status === "onsite";
  const dispatchLabel = incident.kind === "hidden" ? "Locate & repair" : "Dispatch crew";
  const verifyDone = incident.verifyPasses ?? 0;
  const arrived = ARRIVAL_SLOTS - crewEtaSlots;

  return (
    <div className={`${styles.card} ${selected ? styles.cardSelected : ""}`}>
      <div className={styles.cardTop}>
        <button
          className={styles.cardSelect}
          onClick={onSelect}
          aria-label={`Focus sector ${incident.sectorId}`}
        >
          {incident.sectorId}
        </button>
        <span className={styles.why}>{verdictWord(incident.verdict)}</span>
        <span className={styles.score}>{s.P}</span>
      </div>

      <div className={styles.scoreBars}>
        {SCORE_BARS.map((bar) => (
          <div
            key={bar.key}
            className={styles.scoreBar}
            title={`${bar.label}: ${s[bar.key].toFixed(2)} (weight ${bar.weight})`}
          >
            <span className={styles.scoreBarLabel}>{bar.label}</span>
            <span className={styles.scoreBarTrack}>
              <span
                className={styles.scoreBarFill}
                style={{ width: `${Math.round(s[bar.key] * 100)}%` }}
              />
            </span>
          </div>
        ))}
      </div>

      {incident.why && <div className={styles.why}>{incident.why}</div>}

      {status === "verifying" && (
        <div className={styles.why}>
          Verifying
          <span
            className={styles.etaBlocks}
            aria-label={`${verifyDone} of ${VERIFY_SLOTS} checks passed`}
          >
            {range(VERIFY_SLOTS).map((i) => (
              <span
                key={i}
                className={`${styles.etaBlock} ${i < verifyDone ? styles.etaBlockOn : ""}`}
              />
            ))}
          </span>
        </div>
      )}

      {(canDispatch || enRoute || onSite) && (
        <div className={styles.cardActions}>
          {(canDispatch || enRoute) && (
            <PixelButton
              onClick={onDispatch}
              disabled={busy || enRoute || dispatchDisabledReason !== null}
            >
              {dispatchLabel}
            </PixelButton>
          )}
          {canDispatch && dispatchDisabledReason && (
            <span className={styles.why}>{dispatchDisabledReason}</span>
          )}
          {enRoute && (
            <span className={styles.why}>
              Crew en route, ETA {crewEtaSlots}
              <span className={styles.etaBlocks} aria-label="crew arrival progress">
                {range(ARRIVAL_SLOTS).map((i) => (
                  <span
                    key={i}
                    className={`${styles.etaBlock} ${i < arrived ? styles.etaBlockOn : ""}`}
                  />
                ))}
              </span>
            </span>
          )}
          {onSite && (
            <>
              <span className={styles.why}>Crew on site</span>
              <PixelButton variant="danger" onClick={onRepair} disabled={busy}>
                Mark repaired
              </PixelButton>
            </>
          )}
        </div>
      )}
    </div>
  );
}
