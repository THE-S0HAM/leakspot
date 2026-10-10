// RunState: the serializable aggregate the API stores (one item per run, ≤ 8 KB). It holds only what
// cannot be recomputed from the seed: the clock, control flags, crew, sector statuses + current ratios,
// open/closed incidents, report ledger and recent events. Baselines and history are recomputed from the
// seed (run/history.ts); the active-leak ground truth lives in the sim and is held in RunContext.

import type { SectorId } from "../world/jaldhara";
import type { Incident } from "../engine/incidents";
import type { SectorStatus } from "../engine/types";
import type { LeakDef } from "../sim/leaks";
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
  /** this slot's inlet reading (litres) and consumption (litres), for the sector tooltip/panel. */
  inflowLitres: number;
  usedLitres: number;
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
  /** true for scripted NPC reports applied by tick. */
  scripted?: boolean;
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
  /** ground-truth leak ids repaired so far — a runtime fact, so it lives in state, not context. */
  repairedLeakIds: string[];
  /** ids of scripted NPC reports already applied by tick (each applied exactly once). */
  appliedReports: string[];
  /**
   * Citizen reports created but not yet classified (api-contract.md two-step create → classify). Kept
   * here so the two requests round-trip through DynamoDB on a stateless Lambda. Cleared on classify.
   */
  pendingReports: PendingReport[];
};

/** A report awaiting classification: enough to fuse it once the photo is classified. */
export type PendingReport = {
  id: string;
  type: "leak_photo" | "low_water";
  x: number;
  z: number;
  selfChoice?: "flowing" | "dripping" | "weak_flow" | "no_water";
};

/**
 * Non-serialized, seed-derived context: PURE data only (history, baselines, building medians and the
 * leak definitions). It holds no runtime facts, so rebuilding it from the seed on a fresh Lambda yields
 * an identical context every time. All runtime state round-trips through RunState (DynamoDB).
 */
export type RunContext = {
  seed: number;
  history: HistoryModel;
  leaks: LeakDef[];
};

export type ReducerResult = { state: RunState; events: RunEvent[] };
