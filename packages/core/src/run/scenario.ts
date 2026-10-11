// Drives the scripted day-15 Jaldhara scenario with autopilot on. tick now owns
// scripted-report injection, so the runner is just: createRun → autopilot on → loop tick for the day.
// Reusable for the Showcase. Returns the final state + the seed-derived context.

import { createRun, setAutopilot, tick } from "./reducers";
import type { RunContext, RunState } from "./state";

const LAST_SLOT = 19;

/** Run the whole scenario day (slots 0–19) with autopilot by looping tick. */
export function runScenario(seed = 42): { state: RunState; context: RunContext } {
  const created = createRun(seed);
  let state = setAutopilot(created.state, true).state;
  const context = created.context;

  for (let slotIndex = 0; slotIndex <= LAST_SLOT; slotIndex += 1) {
    state = tick(state, context).state;
  }

  return { state, context };
}
