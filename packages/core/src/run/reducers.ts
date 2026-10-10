// Pure run reducers (domain-engine.md §§3–10). Each returns { state, events } and never mutates its
// input. createRun builds the dry day-15 state + seed-derived context; tick advances one supply slot
// (generate readings → balance → anomaly → status → incident rule 1 → autopilot crew → verification);
// addReport applies the report-fusion rules; dispatch/repair/setAutopilot are the crew controls.

import {
  distance,
  SECTOR_BY_ID,
  SECTORS,
  distanceToTrunkMain,
  FACILITIES,
  type Point,
  type SectorId,
} from "../world/jaldhara";
import { evaluateAnomaly } from "../engine/baseline";
import { computeBalance } from "../engine/balance";
import {
  deriveVerdict,
  isActive,
  isOpenForFusion,
  nearestOpenIncidentWithin,
  simHours,
  LOW_WATER_RADIUS_UNITS,
  MERGE_RADIUS_UNITS,
  MERGE_WINDOW_HOURS,
  type Incident,
} from "../engine/incidents";
import { scoreIncident } from "../engine/score";
import { resolvePhotoLabel, resolveSelfReported } from "../engine/vision";
import type { SectorStatus } from "../engine/types";
import { SLOTS_PER_DAY } from "../sim/demand";
import {
  leakDefs,
  leakRepairedBy,
  sectorLeakVolume,
  visibleActiveLeaks,
  type LeakDef,
} from "../sim/leaks";
import { generateSectorReadings } from "../sim/readings";
import { SCRIPTED_REPORTS, type ScriptedReport } from "../sim/script";
import { slotIndexToLabel } from "../units";
import { buildHistoryModel, baselineKey } from "./history";
import type {
  ReportRecord,
  ReducerResult,
  RunContext,
  RunEvent,
  RunState,
  SectorRuntime,
  SlotRef,
} from "./state";

const CREW_ON_DUTY_SLOT = 4; // 07:00
const CREW_ARRIVAL_SLOTS = 2;
const VERIFY_SLOTS = 3;
const VERIFY_EXCESS_THRESHOLD = 0.03;
const VERIFIED_GLOW_SLOTS = 3;
const SCENARIO_DAY = 15;
// Keep the META compact (≤ 8 KB, deadline-mode): only the most recent events live on the aggregate;
// the full history for replay is reconstructed from TICK items by the API, not stored here.
const RECENT_EVENTS_MAX = 8;

// ---------- public API ----------

export type CreateRunResult = { state: RunState; context: RunContext };

export function createRun(seed = 42): CreateRunResult {
  const sectors: SectorRuntime[] = SECTORS.map((s) => ({
    id: s.id,
    status: "normal",
    lossRatio: 0,
    baselineRatio: 0,
    excessLitresPerDay: 0,
    inflowLitres: 0,
    usedLitres: 0,
    anomalousStreak: 0,
    normalStreak: 0,
    recentExcessPerSlot: [],
  }));

  const state: RunState = {
    seed,
    cycle: 1,
    clock: { day: SCENARIO_DAY, slotIndex: -1 },
    clockLabel: "05:45",
    supplyOn: false,
    autopilot: false,
    crew: { status: "idle" },
    cityHealth: 100,
    waterRecoveredLitres: 0,
    sectors,
    incidents: [],
    reports: [],
    recentEvents: [],
    nextIncidentNumber: 1,
    repairedLeakIds: [],
    appliedReports: [],
    pendingReports: [],
  };

  const context: RunContext = { seed, history: buildHistoryModel(seed), leaks: leakDefs() };
  return { state, context };
}

/** Rebuild the pure, seed-derived context. Holds no runtime state (see RunContext). */
export function rebuildContext(seed: number): RunContext {
  return { seed, history: buildHistoryModel(seed), leaks: leakDefs() };
}

// Module-level cache so a warm Lambda rebuilds the heavy history model once per seed, not per request.
// The context is pure seed-derived data, so caching it is always safe (never carries runtime state).
const contextCache = new Map<number, RunContext>();

/** Get the seed-derived context, building and caching it on first use (per seed). */
export function getContext(seed: number): RunContext {
  const cached = contextCache.get(seed);
  if (cached) return cached;
  const context = rebuildContext(seed);
  contextCache.set(seed, context);
  return context;
}

export function setAutopilot(state: RunState, on: boolean): ReducerResult {
  const next = clone(state);
  next.autopilot = on;
  const events = [event(next.clock, "crew", on ? "Autopilot on" : "Autopilot off")];
  return finish(next, events);
}

/** The scenario is one day (day 15). Once its last supply slot (19 = 20:00) is done, the day is over. */
export function isDayOver(state: RunState): boolean {
  return state.clock.day >= SCENARIO_DAY && state.clock.slotIndex >= SLOTS_PER_DAY - 1;
}

/**
 * Advance up to `count` slots, clamping to the slots left in the day: a batch that straddles 20:00 runs
 * out the remaining slots instead of failing. Throws DomainConflict only when the day is already over
 * (no slot left). The last events are returned.
 */
export function tickMany(state: RunState, context: RunContext, count: number): ReducerResult {
  if (isDayOver(state)) throw new DomainConflict("The day is over");
  let s = state;
  let events: RunEvent[] = [];
  for (let i = 0; i < count && !isDayOver(s); i += 1) {
    const result = tick(s, context);
    s = result.state;
    events = result.events;
  }
  return { state: s, events };
}

export function tick(state: RunState, context: RunContext): ReducerResult {
  if (isDayOver(state)) {
    throw new DomainConflict("The day is over");
  }
  const next = clone(state);
  const events: RunEvent[] = [];

  const slot = advanceSlot(next.clock);
  next.clock = slot;
  next.clockLabel = slotIndexToLabel(slot.slotIndex);
  next.supplyOn = true;

  const repaired = new Set(next.repairedLeakIds);

  // 1) Readings → balance → anomaly → status, per sector.
  for (const runtime of next.sectors) {
    const leakVolume = sectorLeakVolume(
      context.leaks,
      repaired,
      runtime.id,
      slot.day,
      slot.slotIndex,
    );
    const readings = generate(context, slot, runtime.id, leakVolume);
    const medians =
      context.history.buildingMedians.get(baselineKey(runtime.id, slot.slotIndex)) ?? [];
    const balance = computeBalance(readings, medians);
    const baseline = context.history.baseline.get(baselineKey(runtime.id, slot.slotIndex)) ?? {
      median: 0,
      scale: 0.005,
    };

    runtime.lossRatio = round3(balance.lossRatio);
    runtime.baselineRatio = round3(baseline.median);
    runtime.inflowLitres = Math.round(balance.inlet);
    runtime.usedLitres = Math.round(balance.consumption);

    if (balance.dataGap) {
      // data gap: no alarm, streak counters untouched.
      setStatusForDataGap(runtime);
      events.push(...sectorEvents(runtime, slot, "data_gap"));
      continue;
    }

    const anomaly = evaluateAnomaly(balance.lossRatio, balance.inlet, baseline);
    updateSectorStatus(runtime, anomaly.anomalous, anomaly.excessLitresPerSlot, next, slot, events);
  }

  // 2) Incident rule 1: a suspected sector with no active incident → create a hidden incident.
  for (const runtime of next.sectors) {
    if (runtime.status === "suspected" && !activeIncidentInSector(next, runtime.id)) {
      createHiddenIncident(next, runtime.id, slot, events);
    }
  }

  // 3) Apply the scripted NPC reports due this slot (each exactly once, marked scripted). The API only
  //    calls tick, so tick owns report injection; appliedReports in RunState keeps it idempotent.
  applyScriptedReportsForSlot(next, slot, events);

  // 4) Verification progress for verifying incidents.
  progressVerification(next, context, slot, events);

  // 5) Autopilot crew + crew transitions.
  advanceCrew(next, slot, events);
  if (next.autopilot) runAutopilot(next, context, slot, events);

  // 6) Recompute scores, verdicts, city health.
  rescoreAll(next);
  recomputeCityHealth(next);

  return finish(next, events);
}

/** The scripted-report key is its day+slot+index, so each applies exactly once across ticks. */
function scriptedKey(report: ScriptedReport, index: number): string {
  return `S${report.day}-${report.slotIndex}-${index}`;
}

/** Convert a scripted report to a reducer ReportInput using its scenario (FakeVision) label. */
function scriptedToInput(report: ScriptedReport, key: string): ReportInput {
  if (report.type === "low_water") {
    return {
      id: key,
      type: "low_water",
      position: report.position,
      sectorId: report.sector,
      selfChoice: report.selfChoice,
    };
  }
  return {
    id: key,
    type: "leak_photo",
    position: report.position,
    sectorId: report.sector,
    label: report.scenarioLabel,
    confidence: 1,
    selfChoice: report.selfChoice === "dripping" ? "dripping" : "flowing",
  };
}

/** Apply (once) every scripted report scheduled for the slot just produced. Mutates `state` in place. */
function applyScriptedReportsForSlot(state: RunState, slot: SlotRef, events: RunEvent[]): void {
  const applied = new Set(state.appliedReports);
  for (let index = 0; index < SCRIPTED_REPORTS.length; index += 1) {
    const report = SCRIPTED_REPORTS[index];
    if (!report || report.day !== slot.day || report.slotIndex !== slot.slotIndex) continue;
    const key = scriptedKey(report, index);
    if (applied.has(key)) continue;
    applyReportInPlace(state, scriptedToInput(report, key), true, events);
    state.appliedReports.push(key);
    applied.add(key);
  }
}

export function addReport(
  state: RunState,
  input: ReportInput,
): ReducerResult & { reportId: string } {
  const next = clone(state);
  const events: RunEvent[] = [];
  const reportId = applyReportInPlace(next, input, input.scripted ?? false, events);
  rescoreAll(next);
  recomputeCityHealth(next);
  return attach(finish(next, events), reportId);
}

/**
 * Apply one report to `state` in place: resolve the vision label (or self-reported fallback), run the
 * fusion rules (§6) and record the report. Returns the report id. Shared by the addReport reducer and
 * the tick's scripted-report injection; callers run rescore/recompute afterwards.
 */
function applyReportInPlace(
  state: RunState,
  input: ReportInput,
  scripted: boolean,
  events: RunEvent[],
): string {
  const reportId = input.id ?? `R${state.reports.length + 1}`;
  const sector = sectorOfPoint(input.position, input.sectorId);
  const record: ReportRecord = {
    id: reportId,
    type: input.type,
    sectorId: sector,
    rejected: false,
    selfReported: false,
    scripted,
  };

  if (input.type === "leak_photo") {
    const resolved = input.selfReported
      ? resolveSelfReported(input.selfChoice === "dripping" ? "dripping" : "flowing")
      : resolvePhotoLabel(input.label ?? "major_leak", input.confidence ?? 1);
    record.selfReported = input.selfReported ?? false;
    record.label = resolved.label;
    if (resolved.rejected) {
      record.rejected = true;
      state.reports.push(record);
      events.push(event(slotRefOf(state), "report", `Report ${reportId} rejected (not a leak)`));
      return reportId;
    }
    attachLeakPhoto(state, sector, input.position, resolved, slotRefOf(state), events, record);
  } else {
    attachLowWater(state, sector, input.position, slotRefOf(state), events, record);
  }

  state.reports.push(record);
  return reportId;
}

export function dispatch(state: RunState, incidentId: string): ReducerResult {
  const next = clone(state);
  // Disallowed actions throw DomainConflict so the API returns 409 and the UI shows a toast — these
  // are control-plane errors, never engine events, so they must not land in recentEvents.
  const incident = next.incidents.find((i) => i.id === incidentId);
  if (!incident || !isOpenForFusion(incident)) {
    throw new DomainConflict("That incident is not open for dispatch");
  }
  if (next.clock.slotIndex < CREW_ON_DUTY_SLOT && next.clock.slotIndex >= 0) {
    throw new DomainConflict("Crew starts at 07:00");
  }
  if (next.crew.status !== "idle") {
    throw new DomainConflict("Crew is busy");
  }
  next.crew = { status: "dispatched", incidentId, etaSlots: CREW_ARRIVAL_SLOTS };
  incident.status = "dispatched";
  return finish(next, [event(next.clock, "crew", `Crew dispatched to ${incident.sectorId}`)]);
}

export function repair(state: RunState, context: RunContext, incidentId: string): ReducerResult {
  const next = clone(state);
  const incident = next.incidents.find((i) => i.id === incidentId);
  if (!incident) throw new DomainConflict("No such incident");
  if (next.crew.status !== "onsite" || next.crew.incidentId !== incidentId) {
    throw new DomainConflict("The crew is not on site yet");
  }
  applyRepair(next, context, incident);
  next.crew = { status: "idle", etaSlots: undefined };
  return finish(next, [event(next.clock, "crew", `Repair marked at ${incident.sectorId}`)]);
}

export class DomainConflict extends Error {
  readonly code = "CONFLICT";
}

export type ReportInput = {
  id?: string;
  type: "leak_photo" | "low_water";
  position: Point;
  sectorId?: SectorId;
  /** resolved vision label when not self-reported. */
  label?: Parameters<typeof resolvePhotoLabel>[0];
  confidence?: number;
  selfReported?: boolean;
  selfChoice?: "flowing" | "dripping" | "weak_flow" | "no_water";
  /** marks a scripted NPC report (set by tick); public reports omit it. */
  scripted?: boolean;
};

// ---------- internals ----------

function generate(context: RunContext, slot: SlotRef, sectorId: SectorId, leakVolume: number) {
  return generateSectorReadings(
    context.seed,
    slot.day,
    slot.slotIndex,
    SECTOR_BY_ID[sectorId],
    leakVolume,
  );
}

function advanceSlot(clock: SlotRef): SlotRef {
  if (clock.slotIndex < 0) return { day: clock.day, slotIndex: 0 };
  if (clock.slotIndex >= SLOTS_PER_DAY - 1) return { day: clock.day + 1, slotIndex: 0 };
  return { day: clock.day, slotIndex: clock.slotIndex + 1 };
}

function updateSectorStatus(
  runtime: SectorRuntime,
  anomalous: boolean,
  excessPerSlot: number,
  state: RunState,
  slot: SlotRef,
  events: RunEvent[],
): void {
  // While an incident in this sector is being verified (or just verified and glowing), the sector
  // status is driven by verification, not the raw anomaly stream.
  if (runtime.status === "verifying" || runtime.status === "verified") {
    if (anomalous) {
      runtime.anomalousStreak += 1;
      runtime.recentExcessPerSlot = [
        ...runtime.recentExcessPerSlot,
        Math.round(excessPerSlot),
      ].slice(-2);
      runtime.excessLitresPerDay = Math.round(mean(runtime.recentExcessPerSlot) * SLOTS_PER_DAY);
    } else {
      runtime.anomalousStreak = 0;
    }
    return;
  }

  if (anomalous) {
    runtime.anomalousStreak += 1;
    runtime.normalStreak = 0;
    runtime.recentExcessPerSlot = [...runtime.recentExcessPerSlot, Math.round(excessPerSlot)].slice(
      -2,
    );
    runtime.excessLitresPerDay = Math.round(mean(runtime.recentExcessPerSlot) * SLOTS_PER_DAY);

    const prior = runtime.status;
    // confirmed is a locked status set by verdict; don't downgrade it to suspected/watch.
    if (runtime.status !== "confirmed") {
      if (runtime.anomalousStreak >= 2) setSectorStatus(runtime, "suspected");
      else setSectorStatus(runtime, "watch");
    }
    if (runtime.status !== prior) events.push(...sectorEvents(runtime, slot, runtime.status));
  } else {
    runtime.anomalousStreak = 0;
    runtime.normalStreak += 1;
    const verifying = openIncidentInSector(state, runtime.id)?.status === "verifying";
    if (
      runtime.normalStreak >= 2 &&
      !verifying &&
      !isLockedStatus(runtime.status) &&
      runtime.status !== "normal"
    ) {
      setSectorStatus(runtime, "normal");
      runtime.excessLitresPerDay = 0;
    }
  }
}

function isLockedStatus(status: SectorStatus): boolean {
  return status === "confirmed" || status === "verifying";
}

function setSectorStatus(runtime: SectorRuntime, status: SectorStatus): void {
  runtime.status = status;
}

function setStatusForDataGap(runtime: SectorRuntime): void {
  // A data gap shows data_gap for the slot but preserves the underlying streaks; keep the prior
  // non-transient status if the sector was already suspected/confirmed/verifying.
  if (!isLockedStatus(runtime.status) && runtime.status !== "verified") {
    runtime.status = "data_gap";
  }
}

function sectorEvents(runtime: SectorRuntime, slot: SlotRef, status: SectorStatus): RunEvent[] {
  return [event(slot, "sector", `${runtime.id} ${status}`)];
}

function openIncidentInSector(state: RunState, sectorId: SectorId): Incident | undefined {
  return state.incidents.find((i) => i.sectorId === sectorId && isOpenForFusion(i));
}

/** Any incident in the sector that is still active (open/dispatched/onsite/verifying/reopened). */
function activeIncidentInSector(state: RunState, sectorId: SectorId): Incident | undefined {
  return state.incidents.find((i) => i.sectorId === sectorId && isActive(i));
}

function createHiddenIncident(
  state: RunState,
  sectorId: SectorId,
  slot: SlotRef,
  events: RunEvent[],
): Incident {
  const sector = SECTOR_BY_ID[sectorId];
  const incident: Incident = {
    id: incidentId(state),
    kind: "hidden",
    sectorId,
    pin: { ...sector.centroid },
    status: "open",
    verdict: "HIDDEN_SUSPECTED",
    photos: [],
    lowWater: [],
    hasPhoto: false,
    firstEvidenceSimHours: simHours(slot.day, slot.slotIndex),
    score: { W: 0, E: 0, C: 0, K: 0, P: 0 },
    why: "",
  };
  state.incidents.push(incident);
  events.push(event(slot, "incident", `${sectorId} hidden leak suspected`));
  return incident;
}

function attachLeakPhoto(
  state: RunState,
  sectorId: SectorId,
  position: Point,
  resolved: ReturnType<typeof resolvePhotoLabel>,
  slot: SlotRef,
  events: RunEvent[],
  record: ReportRecord,
): void {
  const photo = {
    position,
    label: resolved.label,
    severity: resolved.severity,
    confident: resolved.confident,
  };

  // 2a) open hidden incident in the same sector without a photo → attach, move pin to the photo.
  const hiddenNoPhoto = state.incidents.find(
    (i) => i.sectorId === sectorId && i.kind === "hidden" && !i.hasPhoto && isOpenForFusion(i),
  );
  if (hiddenNoPhoto) {
    hiddenNoPhoto.photos.push(photo);
    hiddenNoPhoto.hasPhoto = true;
    hiddenNoPhoto.pin = { ...position };
    record.incidentId = hiddenNoPhoto.id;
    events.push(event(slot, "report", `${record.id} attached to ${hiddenNoPhoto.id}`));
    return;
  }

  // 2b) else open incident within 5 units and first evidence within 72 h → merge.
  const now = simHours(slot.day, slot.slotIndex);
  const mergeTarget = state.incidents.find(
    (i) =>
      isOpenForFusion(i) &&
      distance(i.pin, position) <= MERGE_RADIUS_UNITS &&
      now - i.firstEvidenceSimHours <= MERGE_WINDOW_HOURS,
  );
  if (mergeTarget) {
    mergeTarget.photos.push(photo);
    mergeTarget.hasPhoto = true;
    record.incidentId = mergeTarget.id;
    events.push(event(slot, "report", `${record.id} merged into ${mergeTarget.id}`));
    return;
  }

  // 2c) else create a visible incident at the report position.
  const incident: Incident = {
    id: incidentId(state),
    kind: "visible",
    sectorId,
    pin: { ...position },
    status: "open",
    verdict: "LOCAL_LEAK",
    photos: [photo],
    lowWater: [],
    hasPhoto: true,
    firstEvidenceSimHours: now,
    score: { W: 0, E: 0, C: 0, K: 0, P: 0 },
    why: "",
  };
  state.incidents.push(incident);
  record.incidentId = incident.id;
  events.push(event(slot, "incident", `${sectorId} local leak reported`));
}

function attachLowWater(
  state: RunState,
  sectorId: SectorId,
  position: Point,
  slot: SlotRef,
  events: RunEvent[],
  record: ReportRecord,
): void {
  record.position = { ...position };
  const nearest = nearestOpenIncidentWithin(state.incidents, position, LOW_WATER_RADIUS_UNITS);
  if (nearest) {
    nearest.lowWater.push({ position });
    record.incidentId = nearest.id;
    events.push(event(slot, "report", `${record.id} low water attached to ${nearest.id}`));
    return;
  }

  // Keep pending; cluster rule: 3 pending low-water within 15 units of each other → cluster.
  const pending = state.reports.filter(
    (r) => r.type === "low_water" && !r.incidentId && r.sectorId === sectorId && r.position,
  );
  const positions: Point[] = [...pending.map((r) => r.position as Point), position];
  if (positions.length >= 3) {
    const cluster = clusterWithin(positions, LOW_WATER_RADIUS_UNITS);
    if (cluster) {
      const incident = createClusterIncident(state, sectorId, cluster, slot, events);
      record.incidentId = incident.id;
      for (const r of pending) r.incidentId = incident.id;
      return;
    }
  }
  // otherwise leave pending (no incidentId yet)
}

function clusterWithin(positions: Point[], radius: number): Point | undefined {
  for (const centre of positions) {
    const near = positions.filter((p) => distance(p, centre) <= radius);
    if (near.length >= 3) return centroidOf(near);
  }
  return undefined;
}

function createClusterIncident(
  state: RunState,
  sectorId: SectorId,
  pin: Point,
  slot: SlotRef,
  events: RunEvent[],
): Incident {
  const incident: Incident = {
    id: incidentId(state),
    kind: "cluster",
    sectorId,
    pin,
    status: "open",
    verdict: "LOCAL_LEAK",
    photos: [],
    lowWater: [{ position: pin }],
    hasPhoto: false,
    firstEvidenceSimHours: simHours(slot.day, slot.slotIndex),
    score: { W: 0, E: 0, C: 0, K: 0, P: 0 },
    why: "",
  };
  state.incidents.push(incident);
  events.push(event(slot, "incident", `${sectorId} low-water cluster`));
  return incident;
}

function advanceCrew(state: RunState, slot: SlotRef, events: RunEvent[]): void {
  const crew = state.crew;
  if (crew.status === "idle" || crew.etaSlots === undefined) return;
  crew.etaSlots -= 1;
  if (crew.etaSlots > 0) return;

  if (crew.status === "dispatched") {
    crew.status = "onsite";
    crew.etaSlots = undefined;
    const incident = state.incidents.find((i) => i.id === crew.incidentId);
    if (incident) incident.status = "onsite";
    events.push(event(slot, "crew", `Crew on site at ${incident?.sectorId ?? "the leak"}`));
  }
}

function runAutopilot(
  state: RunState,
  context: RunContext,
  slot: SlotRef,
  events: RunEvent[],
): void {
  const onDuty = slot.slotIndex >= CREW_ON_DUTY_SLOT || slot.slotIndex < 0;
  if (!onDuty) return;

  if (state.crew.status === "onsite" && state.crew.incidentId) {
    const incident = state.incidents.find((i) => i.id === state.crew.incidentId);
    if (incident) {
      applyRepair(state, context, incident);
      state.crew = { status: "idle" };
      events.push(event(slot, "crew", `Repair marked at ${incident.sectorId}`));
    }
    return;
  }

  if (state.crew.status === "idle") {
    const target = highestOpenIncident(state);
    if (target) {
      state.crew = { status: "dispatched", incidentId: target.id, etaSlots: CREW_ARRIVAL_SLOTS };
      target.status = "dispatched";
      events.push(event(slot, "crew", `Crew dispatched to ${target.sectorId}`));
    }
  }
}

function highestOpenIncident(state: RunState): Incident | undefined {
  const open = state.incidents.filter((i) => i.status === "open" || i.status === "reopened");
  if (open.length === 0) return undefined;
  open.sort(
    (a, b) =>
      b.score.P - a.score.P ||
      b.score.W - a.score.W ||
      a.firstEvidenceSimHours - b.firstEvidenceSimHours,
  );
  return open[0];
}

function applyRepair(state: RunState, context: RunContext, incident: Incident): void {
  const runtime = state.sectors.find((s) => s.id === incident.sectorId);
  const sectorWasSuspected =
    runtime?.status === "suspected" ||
    runtime?.status === "confirmed" ||
    runtime?.status === "verifying";

  // Record which ground-truth leak this fixes in RunState (a runtime fact, so it round-trips).
  const repaired = new Set(state.repairedLeakIds);
  const fixedId = leakRepairedBy(
    context.leaks,
    repaired,
    incident.sectorId,
    incident.pin,
    incident.kind === "hidden",
  );
  if (fixedId && !repaired.has(fixedId)) state.repairedLeakIds.push(fixedId);

  incident.excessLitresPerDayAtRepair = runtime?.excessLitresPerDay ?? 0;

  if (sectorWasSuspected) {
    incident.status = "verifying";
    incident.verifyPasses = 0;
    if (runtime) runtime.status = "verifying";
  } else {
    incident.status = "closed_logged";
  }
}

function progressVerification(
  state: RunState,
  context: RunContext,
  slot: SlotRef,
  events: RunEvent[],
): void {
  for (const incident of state.incidents) {
    if (incident.status !== "verifying") continue;
    const runtime = state.sectors.find((s) => s.id === incident.sectorId);
    const repaired = new Set(state.repairedLeakIds);
    const leakVolume = sectorLeakVolume(
      context.leaks,
      repaired,
      incident.sectorId,
      slot.day,
      slot.slotIndex,
    );
    const readings = generate(context, slot, incident.sectorId, leakVolume);
    const medians =
      context.history.buildingMedians.get(baselineKey(incident.sectorId, slot.slotIndex)) ?? [];
    const balance = computeBalance(readings, medians);
    const baseline = context.history.baseline.get(
      baselineKey(incident.sectorId, slot.slotIndex),
    ) ?? {
      median: 0,
      scale: 0.005,
    };
    const excessRatio = balance.lossRatio - baseline.median;

    if (excessRatio <= VERIFY_EXCESS_THRESHOLD) {
      incident.verifyPasses = (incident.verifyPasses ?? 0) + 1;
      if (incident.verifyPasses >= VERIFY_SLOTS) {
        incident.status = "verified";
        incident.recoveredLitresPerDay = incident.excessLitresPerDayAtRepair ?? 0;
        state.waterRecoveredLitres += incident.recoveredLitresPerDay;
        if (runtime) {
          runtime.status = "verified";
          runtime.verifiedGlow = VERIFIED_GLOW_SLOTS;
          runtime.excessLitresPerDay = 0;
        }
        events.push(event(slot, "incident", `${incident.sectorId} verified by meters`));
      }
    } else {
      incident.status = "reopened";
      incident.verifyPasses = 0;
      if (runtime) runtime.status = "suspected";
      events.push(event(slot, "incident", `${incident.sectorId} reopened, excess returned`));
    }
  }

  // decay the verified glow
  for (const runtime of state.sectors) {
    if (runtime.verifiedGlow !== undefined) {
      runtime.verifiedGlow -= 1;
      if (runtime.verifiedGlow <= 0) {
        runtime.verifiedGlow = undefined;
        if (runtime.status === "verified") runtime.status = "normal";
      }
    }
  }
}

function rescoreAll(state: RunState): void {
  for (const incident of state.incidents) {
    if (!isActive(incident)) continue;
    const runtime = state.sectors.find((s) => s.id === incident.sectorId);
    const sector = SECTOR_BY_ID[incident.sectorId];
    const suspected =
      runtime?.status === "suspected" ||
      runtime?.status === "confirmed" ||
      runtime?.status === "verifying";
    const meterAnomaly = Boolean(suspected);
    const evidenceCount = incident.photos.length + incident.lowWater.length;
    const maxSeverity = incident.photos.reduce((m, p) => Math.max(m, p.severity), 0);
    const anyConfidentPhoto = incident.photos.some((p) => p.confident);
    const sewageMixing = incident.photos.some((p) => p.label === "sewage_mixing");

    incident.score = scoreIncident({
      excessLitresPerDay: suspected ? (runtime?.excessLitresPerDay ?? 0) : 0,
      sectorSuspectedOrConfirmed: Boolean(suspected),
      maxSeverity,
      evidenceCount,
      facilityFactor: facilityFactorFor(incident.pin),
      sectorConnections: sector.connections,
      meterAnomaly,
      anyConfidentPhoto,
      sewageMixing,
    });

    incident.verdict = deriveVerdict({
      kind: incident.kind,
      meterAnomaly,
      hasPhoto: incident.hasPhoto,
      hasLowWater: incident.lowWater.length > 0,
    });
    incident.why = whyLine(incident, suspected ? (runtime?.excessLitresPerDay ?? 0) : 0);

    if (incident.verdict === "CONFIRMED" && runtime && runtime.status !== "verifying") {
      runtime.status = "confirmed";
    }
  }
}

function facilityFactorFor(pin: Point): number {
  let factor = 0;
  for (const f of FACILITIES) {
    const d = distance(f.at, pin);
    if (f.kind === "hospital" && d <= 30) factor = Math.max(factor, 1.0);
    if (f.kind === "school" && d <= 30) factor = Math.max(factor, 0.7);
  }
  if (distanceToTrunkMain(pin) <= 2) factor = Math.max(factor, 0.8);
  return factor;
}

function whyLine(incident: Incident, excessLitresPerDay: number): string {
  const parts: string[] = [];
  if (excessLitresPerDay > 0) parts.push(`Excess ${formatLakh(excessLitresPerDay)} L/day`);
  const evidence = incident.photos.length + incident.lowWater.length;
  if (evidence > 0) {
    const topLabel = humanLabel(incident.photos[0]?.label ?? "low water");
    parts.push(`${evidence} reports (${topLabel})`);
  }
  const signals = (incident.score.K > 0 ? Math.round(incident.score.K * 3) : 0) + "";
  parts.push(`${signals} of 3 signals agree`);
  return parts.join(", ");
}

/** Human words for a vision label inside the why-line (no snake_case reaches the UI). */
function humanLabel(label: string): string {
  const map: Record<string, string> = {
    burst: "burst",
    sewage_mixing: "sewage in supply",
    major_leak: "major leak",
    minor_drip: "small drip",
    unclear: "unclear photo",
    "low water": "low water",
  };
  return map[label] ?? label.replace(/_/g, " ");
}

function recomputeCityHealth(state: RunState): void {
  let sumU = 0;
  let sumI = 0;
  let sumBaselineI = 0;
  for (const runtime of state.sectors) {
    if (runtime.status === "data_gap") continue;
    const sector = SECTOR_BY_ID[runtime.id];
    const inlet = estimateInlet(sector.connections);
    sumI += inlet;
    sumU += runtime.lossRatio * inlet;
    sumBaselineI += runtime.baselineRatio * inlet;
  }
  if (sumI === 0) {
    state.cityHealth = 100;
    return;
  }
  const cityLoss = sumU / sumI;
  const cityBaseline = sumBaselineI / sumI;
  const health = 100 * (1 - clamp((cityLoss - cityBaseline) / 0.2, 0, 1));
  state.cityHealth = Math.round(health);
}

function estimateInlet(connections: number): number {
  // A nominal inlet weight for the city-health average; proportional to connections.
  return connections;
}

// ---------- small helpers ----------

function sectorOfPoint(position: Point, fallback?: SectorId): SectorId {
  const found = SECTORS.find(
    (s) =>
      position.x >= s.box.xMin &&
      position.x < s.box.xMax &&
      position.z >= s.box.zMin &&
      position.z < s.box.zMax,
  );
  return found?.id ?? fallback ?? "A1";
}

function incidentId(state: RunState): string {
  const id = `#${state.nextIncidentNumber}`;
  state.nextIncidentNumber += 1;
  return id;
}

function event(at: SlotRef, kind: RunEvent["kind"], label: string): RunEvent {
  return { at: { ...at }, kind, label };
}

function slotRefOf(state: RunState): SlotRef {
  return { ...state.clock };
}

function finish(state: RunState, events: RunEvent[]): ReducerResult {
  state.recentEvents = [...state.recentEvents, ...events].slice(-RECENT_EVENTS_MAX);
  return { state, events };
}

function attach<T extends ReducerResult>(result: T, reportId: string): T & { reportId: string } {
  return { ...result, reportId };
}

function clone(state: RunState): RunState {
  return structuredClone(state);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function centroidOf(points: readonly Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    z: points.reduce((s, p) => s + p.z, 0) / n,
  };
}

function formatLakh(litres: number): string {
  if (litres >= 100000) return `${(litres / 100000).toFixed(1).replace(/\.0$/, "")} lakh`;
  return litres.toLocaleString("en-IN");
}

/** Exported helpers for the sim-driven visible-leak list (used by the API/world view). */
export function currentVisibleLeaks(
  context: RunContext,
  clock: SlotRef,
  repairedLeakIds: readonly string[] = [],
): { x: number; z: number; size: number }[] {
  return visibleActiveLeaks(context.leaks, new Set(repairedLeakIds), clock.day, clock.slotIndex);
}

export type { LeakDef };
