// Incident quest card: verdict + sector, score P, the why-line, the W/E/C/K breakdown, and the stage
// controls (Dispatch / Mark repaired / Verifying n/3 / VERIFIED banner).
import type { JSX } from "react";
import type { IncidentView } from "../../api/types";
import { PixelButton } from "../../ui/PixelButton";
import styles from "./command.module.css";

export function QuestCard({
  incident,
  busy,
  crewBusyElsewhere,
  onDispatch,
  onRepair,
}: {
  incident: IncidentView;
  busy: boolean;
  crewBusyElsewhere: boolean;
  onDispatch: () => void;
  onRepair: () => void;
}): JSX.Element {
  const s = incident.score;
  const canDispatch = incident.status === "open" || incident.status === "reopened";
  const canRepair = incident.status === "onsite";
  const verifying = incident.status === "verifying";
  const done = incident.status === "verified";
  const logged = incident.status === "closed_logged";

  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <strong>{incident.sectorId}</strong>
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
      {verifying && <div className={styles.why}>Verifying {incident.verifyPasses ?? 0}/3…</div>}
      {!done && !logged && (
        <div className={styles.cardActions}>
          {canDispatch && (
            <PixelButton onClick={onDispatch} disabled={busy || crewBusyElsewhere}>
              {incident.kind === "hidden" ? "Locate & repair" : "Dispatch crew"}
            </PixelButton>
          )}
          {incident.status === "dispatched" && <span className={styles.why}>Crew en route…</span>}
          {canRepair && (
            <PixelButton variant="danger" onClick={onRepair} disabled={busy}>
              Mark repaired
            </PixelButton>
          )}
        </div>
      )}
    </div>
  );
}
