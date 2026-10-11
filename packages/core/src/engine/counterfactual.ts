// Counterfactual: litres saved by LeakSpot vs a world without it, used by the
// command "with vs without" sliders. Pure; labelled "simulation" by the UI. engine/ only.

export type CounterfactualIncident = {
  id: string;
  kind: "hidden" | "visible" | "cluster";
  label?: string;
  /** meter excess L/day if known, else undefined (fall back to nominal by label). */
  excessLitresPerDay?: number;
  firstEvidenceSimHours: number;
  repairedSimHours?: number;
};

export type CounterfactualSliders = { reportedDelayDays: number; hiddenRunDays: number };

export const DEFAULT_SLIDERS: CounterfactualSliders = { reportedDelayDays: 3, hiddenRunDays: 30 };

const NOMINAL_LPD: Record<string, number> = {
  burst: 50000,
  major_leak: 3000,
  minor_drip: 1500,
  sewage_mixing: 50000,
  unclear: 3000,
};
const TANKER_LITRES = 10000;

function leakSizeLitresPerDay(incident: CounterfactualIncident): number {
  if (incident.excessLitresPerDay && incident.excessLitresPerDay > 0) {
    return incident.excessLitresPerDay;
  }
  return NOMINAL_LPD[incident.label ?? "major_leak"] ?? NOMINAL_LPD["major_leak"] ?? 3000;
}

export type CounterfactualRow = { id: string; litresSaved: number; tankerLoads: number };
export type CounterfactualResult = {
  rows: CounterfactualRow[];
  totalLitres: number;
  totalTankers: number;
};

/** Litres saved per incident and total. */
export function counterfactual(
  incidents: readonly CounterfactualIncident[],
  sliders: CounterfactualSliders = DEFAULT_SLIDERS,
): CounterfactualResult {
  const rows: CounterfactualRow[] = incidents.map((incident) => {
    const sizePerDay = leakSizeLitresPerDay(incident);
    const isHidden = incident.kind === "hidden";
    const withoutDays = isHidden ? sliders.hiddenRunDays : sliders.reportedDelayDays;

    const withDays =
      incident.repairedSimHours === undefined
        ? withoutDays // unrepaired saves nothing: with == without
        : Math.max(0, (incident.repairedSimHours - incident.firstEvidenceSimHours) / 24);

    const litresSaved =
      incident.repairedSimHours === undefined
        ? 0
        : Math.max(0, (withoutDays - withDays) * sizePerDay);

    return { id: incident.id, litresSaved, tankerLoads: litresSaved / TANKER_LITRES };
  });

  const totalLitres = rows.reduce((s, r) => s + r.litresSaved, 0);
  return { rows, totalLitres, totalTankers: totalLitres / TANKER_LITRES };
}
