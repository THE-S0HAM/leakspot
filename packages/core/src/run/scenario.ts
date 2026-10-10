// Drives the scripted day-15 Jaldhara scenario (scenario-jaldhara.md) with autopilot on and FakeVision
// (scenario labels). Used by scenario.test.ts and reusable for the Showcase. Lives in run/ because it
// bridges the sim's scripted reports with the engine reducers. Returns the final state + context.

import { SCRIPTED_REPORTS } from "../sim/script";
import { addReport, createRun, setAutopilot, tick, type ReportInput } from "./reducers";
import type { RunContext, RunState } from "./state";

const DAY = 15;
const LAST_SLOT = 19;

/** Convert a scripted report to a reducer ReportInput using its scenario (FakeVision) label. */
function toInput(report: (typeof SCRIPTED_REPORTS)[number], index: number): ReportInput {
  if (report.type === "low_water") {
    return {
      id: `R${index + 1}`,
      type: "low_water",
      position: report.position,
      sectorId: report.sector,
      selfChoice: report.selfChoice,
    };
  }
  return {
    id: `R${index + 1}`,
    type: "leak_photo",
    position: report.position,
    sectorId: report.sector,
    label: report.scenarioLabel,
    confidence: 1,
    selfChoice: report.selfChoice === "dripping" ? "dripping" : "flowing",
  };
}

/** Run the whole scenario day (slots 0–19) with autopilot; inject each slot's reports after its tick. */
export function runScenario(seed = 42): { state: RunState; context: RunContext } {
  const created = createRun(seed);
  let state = setAutopilot(created.state, true).state;
  const context = created.context;

  for (let slotIndex = 0; slotIndex <= LAST_SLOT; slotIndex += 1) {
    state = tick(state, context).state;

    const dueReports = SCRIPTED_REPORTS.map((r, i) => ({ r, i })).filter(
      ({ r }) => r.day === DAY && r.slotIndex === slotIndex,
    );
    for (const { r, i } of dueReports) {
      state = addReport(state, toInput(r, i)).state;
    }
  }

  return { state, context };
}
