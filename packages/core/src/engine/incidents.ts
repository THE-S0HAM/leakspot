// Incident model and fusion rules (domain-engine.md §6). Pure data + helpers; the run reducer applies
// them. An incident aggregates meter and citizen evidence for a suspected area and carries its verdict,
// score breakdown and a human "why" line. engine/ only — no sim/, no ground truth.

import { distance, type Point, type SectorId } from "../world/jaldhara";
import type { ScoreBreakdown } from "./score";

export type IncidentKind = "hidden" | "visible" | "cluster";
export type IncidentVerdict = "CONFIRMED" | "HIDDEN_SUSPECTED" | "HIDDEN_AREA_KNOWN" | "LOCAL_LEAK";
export type IncidentStatus =
  | "open"
  | "dispatched"
  | "onsite"
  | "repaired"
  | "verifying"
  | "verified"
  | "reopened"
  | "closed_logged";

export type AttachedPhoto = {
  position: Point;
  label: string;
  severity: number;
  confident: boolean;
};
export type AttachedLowWater = { position: Point };

export type Incident = {
  id: string;
  kind: IncidentKind;
  sectorId: SectorId;
  pin: Point;
  status: IncidentStatus;
  verdict: IncidentVerdict;
  photos: AttachedPhoto[];
  lowWater: AttachedLowWater[];
  hasPhoto: boolean;
  /** sim-hours of the first evidence (day*… ) for the 72-hour merge window and tie-breaks. */
  firstEvidenceSimHours: number;
  score: ScoreBreakdown;
  why: string;
  /** set when repaired; pre-repair excess L/day, logged as recovered on verify. */
  excessLitresPerDayAtRepair?: number;
  recoveredLitresPerDay?: number;
  /** verification progress 0..3 once verifying. */
  verifyPasses?: number;
};

export const MERGE_RADIUS_UNITS = 5;
export const LOW_WATER_RADIUS_UNITS = 15;
export const MERGE_WINDOW_HOURS = 72;

/** An incident is "open" for fusion/dispatch while not closed/verified/reopened-is-open. */
export function isOpenForFusion(incident: Incident): boolean {
  return (
    incident.status === "open" ||
    incident.status === "reopened" ||
    incident.status === "dispatched" ||
    incident.status === "onsite"
  );
}

/** True while an incident still counts as active work (not closed/verified). */
export function isActive(incident: Incident): boolean {
  return incident.status !== "verified" && incident.status !== "closed_logged";
}

/** Convert a (day, slotIndex) to sim-hours for the merge window. 20 slots → but time is wall-clock. */
export function simHours(day: number, slotIndex: number): number {
  // Supply slots map to wall-clock minutes; use day*24h + slot start hour for a monotonic clock.
  const morningSlots = 12;
  const minutes =
    slotIndex < morningSlots ? 6 * 60 + 15 * slotIndex : 18 * 60 + 15 * (slotIndex - morningSlots);
  return day * 24 + minutes / 60;
}

/** Derive the verdict from the evidence present (domain-engine.md §6.4). */
export function deriveVerdict(params: {
  kind: IncidentKind;
  meterAnomaly: boolean;
  hasPhoto: boolean;
  hasLowWater: boolean;
}): IncidentVerdict {
  const { meterAnomaly, hasPhoto, hasLowWater } = params;
  if (meterAnomaly && (hasPhoto || hasLowWater)) return "CONFIRMED";
  if (meterAnomaly && hasLowWater) return "HIDDEN_AREA_KNOWN";
  if (meterAnomaly) return "HIDDEN_SUSPECTED";
  return "LOCAL_LEAK";
}

/** Nearest open incident to a point within `radius`, or undefined. */
export function nearestOpenIncidentWithin(
  incidents: readonly Incident[],
  point: Point,
  radius: number,
): Incident | undefined {
  let best: Incident | undefined;
  let bestDist = Infinity;
  for (const incident of incidents) {
    if (!isOpenForFusion(incident)) continue;
    const d = distance(incident.pin, point);
    if (d <= radius && d < bestDist) {
      best = incident;
      bestDist = d;
    }
  }
  return best;
}
