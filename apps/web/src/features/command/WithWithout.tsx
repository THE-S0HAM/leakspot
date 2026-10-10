// "With vs without LeakSpot" panel: a labelled simulation using @leakspot/core/counterfactual. Sliders
// set the assumptions (how long a reported leak runs without us, how long a hidden one runs). Output is
// litres and 10,000 L tanker-loads. The web app may import @leakspot/core/counterfactual by contract.

import { useMemo, useState, type JSX } from "react";
import {
  counterfactual,
  DEFAULT_SLIDERS,
  type CounterfactualIncident,
} from "@leakspot/core/counterfactual";
import type { IncidentView, SectorRuntime } from "../../api/types";
import { lakh, tankers } from "../../ui/format";
import styles from "./command.module.css";

// Map live incidents to counterfactual inputs. We lack wall-clock timestamps on the wire, so we model
// a repaired incident as fixed quickly with LeakSpot (small withDays) and use the sector's measured
// excess as the leak size; this is a labelled simulation driven by the sliders.
function toInputs(incidents: IncidentView[], sectors: SectorRuntime[]): CounterfactualIncident[] {
  const excessOf = (sectorId: string): number =>
    sectors.find((s) => s.id === sectorId)?.excessLitresPerDay ?? 0;
  const repairedStatuses = new Set(["repaired", "verifying", "verified", "closed_logged"]);
  return incidents.map((inc) => ({
    id: inc.id,
    kind: inc.kind,
    label: inc.verdict === "CONFIRMED" ? "burst" : "major_leak",
    excessLitresPerDay: excessOf(inc.sectorId) || undefined,
    firstEvidenceSimHours: 0,
    // repaired incidents: fixed within ~3 hours of evidence with LeakSpot; others: unrepaired (save 0).
    repairedSimHours: repairedStatuses.has(inc.status) ? 3 : undefined,
  }));
}

export function WithWithout({
  incidents,
  sectors,
}: {
  incidents: IncidentView[];
  sectors: SectorRuntime[];
}): JSX.Element {
  const [reportedDelayDays, setReported] = useState(DEFAULT_SLIDERS.reportedDelayDays);
  const [hiddenRunDays, setHidden] = useState(DEFAULT_SLIDERS.hiddenRunDays);

  const result = useMemo(
    () => counterfactual(toInputs(incidents, sectors), { reportedDelayDays, hiddenRunDays }),
    [incidents, sectors, reportedDelayDays, hiddenRunDays],
  );

  return (
    <div className={styles.counterfactual}>
      <div className={styles.sectionTitle}>With vs without LeakSpot</div>
      <label className={styles.slider}>
        Reported leak runs without us: {reportedDelayDays} days
        <input
          type="range"
          min={1}
          max={14}
          value={reportedDelayDays}
          onChange={(e) => setReported(Number(e.target.value))}
        />
      </label>
      <label className={styles.slider}>
        Hidden leak runs without us: {hiddenRunDays} days
        <input
          type="range"
          min={7}
          max={90}
          value={hiddenRunDays}
          onChange={(e) => setHidden(Number(e.target.value))}
        />
      </label>
      <div className={styles.cfTotal}>{lakh(result.totalLitres)} saved</div>
      <div>{tankers(result.totalLitres)} (simulation)</div>
    </div>
  );
}
