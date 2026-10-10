// Shared view types for run/sector/incident data as it arrives from the API over the wire. These live
// in state/ (not api/) so world/ and ui/ may import the types without tripping the "no API in world/ui"
// dependency rule — the ban is on calling the API, not on knowing its data shapes.

import type { SectorId } from "@leakspot/core/world";

export type SectorStatus =
  "normal" | "watch" | "suspected" | "confirmed" | "data_gap" | "verifying" | "verified";

export type SimClock = { day: number; slotIndex: number; label: string };

export type CrewStatus = "idle" | "dispatched" | "onsite";
export type Crew = { status: CrewStatus; incidentId?: string; etaSlots?: number };

export type ScoreBreakdown = { W: number; E: number; C: number; K: number; P: number };

export type IncidentView = {
  id: string;
  kind: "hidden" | "visible" | "cluster";
  sectorId: SectorId;
  status:
    | "open"
    | "dispatched"
    | "onsite"
    | "repaired"
    | "verifying"
    | "verified"
    | "reopened"
    | "closed_logged";
  verdict: "CONFIRMED" | "HIDDEN_SUSPECTED" | "HIDDEN_AREA_KNOWN" | "LOCAL_LEAK";
  pin: { x: number; z: number };
  score: ScoreBreakdown;
  why: string;
  verifyPasses?: number;
  recoveredLitresPerDay?: number;
};

export type SectorRuntime = {
  id: SectorId;
  status: SectorStatus;
  lossRatio: number;
  baselineRatio: number;
  excessLitresPerDay: number;
  inflowLitres: number;
  usedLitres: number;
};

export type RunEvent = { at: SimClock; label: string; kind: string };

export type RecentReport = {
  code: string;
  reportId: string;
  x: number;
  z: number;
  sectorId: SectorId;
  type: "leak_photo" | "low_water";
  label: string | null;
  confidence: number | null;
  status: string;
  simTime: string | null;
  source: "phone" | "simulated";
};

export type RunStateView = {
  runId: string;
  cycle: number;
  simClock: SimClock;
  supplyOn: boolean;
  autopilot: boolean;
  crew: Crew;
  cityHealth: number;
  waterRecoveredLitres: number;
  sectors: SectorRuntime[];
  incidents: IncidentView[];
  recentEvents: RunEvent[];
  recentReports: RecentReport[];
};

export type PublicStateView = {
  runId: string;
  isShowcase: boolean;
  simClock: SimClock;
  cityHealth: number;
  sectors: { id: SectorId; status: SectorStatus }[];
};

export type Stage = { stage: string; at: string; detail?: string };

export type CreateReportResponse = { reportId: string; ticketCode: string; stages: Stage[] };

export type ClassifyResponse = {
  reportId: string;
  label: string;
  confidence: number;
  fallbackReason?: string;
  rejected: boolean;
  /** Other reports already attached to this incident (0 = new report in the sector). */
  mergedCount: number;
  stages: Stage[];
  incident?: { id: string; status: string; verdict: string; sectorId: SectorId; priority: number };
};

export type TicketView = {
  reportId: string;
  ticketCode: string;
  type: "leak_photo" | "low_water";
  sectorId?: SectorId;
  rejected: boolean;
  selfReported: boolean;
  label?: string;
  status: string;
  mergedCount: number;
  stages: Stage[];
  incident?: { id: string; status: string; verdict: string };
};

export type ApiError = { error: { code: string; message: string; retryAfterSeconds?: number } };
