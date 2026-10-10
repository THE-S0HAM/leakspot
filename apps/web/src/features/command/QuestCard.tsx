// Incident quest card and its state machine: Dispatch (or "Locate & repair" for hidden — both call
// dispatch) → Crew en route with ETA blocks → Crew on site + Mark repaired (only enabled on site) →
// Verifying ▮▮▯ → VERIFIED banner. When dispatch isn't allowed the button is disabled with a reason.
import type { JSX } from "react";
import type { IncidentView } from "../../state/view-types";
import { PixelButton } from "../../ui/PixelButton";
import styles from "./command.module.css";

const ARRIVAL_SLOTS = 2;
const VERIFY_SLOTS = 3;

/** [0, 1, …, n-1] — avoids an unused map arg (eslint args:"all"). */
function range(n: number): number[] {
  return [...Array(n).keys()];
}

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
  /** remaining crew ETA slots while this incident is "dispatched" (from state.crew.etaSlots). */
  crewEtaSlots: number;
  /** non-null → Dispatch is disabled and this reason is shown (e.g. "Crew starts at 07:00"). */
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
  const verifying = status === "verifying";
  const done = status === "verified";
  const logged = status === "closed_logged";
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
        <span className={styles.why}>{incident.verdict.replace(/_/g, " ").toLowerCase()}</span>
        <span className={styles.score}>{s.P}</span>
      </div>
      {incident.why && <div className={styles.why}>{incident.why}</div>}
      <div className={styles.weck}>
        <span>W {s.W.toFixed(2)}</span>
        <span>E {s.E.toFixed(2)}</span>
        <span>C {s.C.toFixed(2)}</span>
        <span>K {s.K.toFixed(2)}</span>
      </div>

      {done && <div className={styles.banner}>Verified by meters</div>}
      {logged && <div className={styles.why}>Repair logged, below meter resolution</div>}

      {verifying && (
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

      {!done && !logged && !verifying && (
        <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
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
