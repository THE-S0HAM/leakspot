// RunState: the serializable aggregate the API stores (one item per run, ≤ 8 KB). It holds only what
// cannot be recomputed from the seed: the clock, control flags, crew, sector statuses + current ratios,
// open/closed incidents, report ledger and recent events. Baselines and history are recomputed from the
// seed (run/history.ts); the active-leak ground truth lives in the sim and is held in RunContext.

import type { SectorId } from "../world/jaldhara";
import type { Incident } from "../engine/incidents";
import type { SectorStatus } from "../engine/types";
import type { ActiveLeak } from "../sim/leaks";
import type { HistoryModel } from "./history";

/** { day, slotIndex }; slotIndex 0–19, or -1 for the dry "before slot 0" state. */
export type SlotRef = { day: number; slotIndex: number };

export type CrewStatus = "idle" | "dispatched" | "onsite";
export type Crew = {
  status: CrewStatus;
  incidentId?: string;
  /** slots until the next crew transition (arrival or return). */
  etaSlots?: number;
};

export type SectorRuntime = {
  id: SectorId;
  status: SectorStatus;
  lossRatio: number;
  baselineRatio: number;
  excessLitresPerDay: number;
  /** consecutive anomalous slots (for watch→suspected) and non-anomalous slots (for return). */
  anomalousStreak: number;
  normalStreak: number;
  /** last two anomalous slots' excessLitresPerSlot, for excessLitresPerDay = mean×20. */
  recentExcessPerSlot: number[];
  /** slots remaining of the post-verify "glow" before returning to normal. */
  verifiedGlow?: number;
};

export type RunEvent = {
  at: SlotRef;
  label: string;
  kind: "sector" | "incident" | "report" | "crew" | "city";
};

export type ReportRecord = {
  id: string;
  type: "leak_photo" | "low_water";
  sectorId: SectorId;
  rejected: boolean;
  selfReported: boolean;
  incidentId?: string;
  label?: string;
  /** low-water report position, kept for the pending-cluster rule. */
  position?: { x: number; z: number };
};

export type RunState = {
  seed: number;
  cycle: number;
  clock: SlotRef; // {15, -1} = before slot 0 (05:45)
  clockLabel: string;
  supplyOn: boolean;
  autopilot: boolean;
  crew: Crew;
  cityHealth: number;
  waterRecoveredLitres: number;
  sectors: SectorRuntime[];
  incidents: Incident[];
  reports: ReportRecord[];
  recentEvents: RunEvent[];
  /** monotonic counter for incident ids within the run. */
  nextIncidentNumber: number;
};

/** Non-serialized, seed-derived context: the history model and the sim's active-leak ground truth. */
export type RunContext = {
  seed: number;
  history: HistoryModel;
  leaks: ActiveLeak[];
};

export type ReducerResult = { state: RunState; events: RunEvent[] };
