// Public API of @leakspot/core consumed by services/api. Exposes the typed DomainError, the unit
// conversions, the run aggregate + reducers, the score function and the engine incident/vision types.
// The web app imports layout via @leakspot/core/world and the counterfactual via
// @leakspot/core/counterfactual, never this root entry (it carries scripted ground truth via sim/).

export { DomainError } from "./errors";
export {
  slotIndexToLabel,
  labelToSlotIndex,
  litresPerHourToPerSlot,
  litresPerSlotToPerHour,
} from "./units";

export { scoreIncident, SEVERITY } from "./engine/score";
export type { ScoreBreakdown, ScoreInput, VisionLabel } from "./engine/score";
export { resolvePhotoLabel, resolveSelfReported } from "./engine/vision";
export type { ResolvedLabel } from "./engine/vision";
export type { Incident, IncidentKind, IncidentStatus, IncidentVerdict } from "./engine/incidents";
export type { SectorStatus } from "./engine/types";

export {
  createRun,
  rebuildContext,
  tick,
  addReport,
  dispatch,
  repair,
  setAutopilot,
  currentVisibleLeaks,
  DomainConflict,
} from "./run/reducers";
export type { ReportInput, CreateRunResult } from "./run/reducers";
export { runScenario } from "./run/scenario";
export type {
  RunState,
  RunContext,
  RunEvent,
  SlotRef,
  SectorRuntime,
  ReportRecord,
  Crew,
  CrewStatus,
  ReducerResult,
} from "./run/state";
