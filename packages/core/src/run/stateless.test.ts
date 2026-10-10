// Statelessness guarantee (API requirement): on AWS every request is a fresh Lambda — load RunState
// JSON, rebuild the context from the seed, run a reducer, save. This test serialises RunState and
// rebuilds the context after EVERY tick, then asserts the scenario ends exactly like the in-memory run.
// If any runtime fact lived only in the context (repaired leaks, applied reports, crew, verification),
// the round-tripped run would diverge.

import { describe, expect, it } from "vitest";
import { createRun, rebuildContext, setAutopilot, tick } from "./reducers";
import { runScenario } from "./scenario";
import type { RunState } from "./state";

function roundTrip(state: RunState): RunState {
  return JSON.parse(JSON.stringify(state)) as RunState;
}

// Rebuilding the history model on every tick (as a fresh Lambda would) is deliberately heavy, so these
// two tests get a generous timeout; they are correctness checks, not performance checks.
const SLOW = 30000;

describe("stateless round trip (fresh Lambda per request)", () => {
  it(
    "ends identically when state is reserialised and context rebuilt after every step",
    { timeout: SLOW },
    () => {
      // Reference: the ordinary in-memory run.
      const reference = runScenario(42).state;

      // Round-tripped run: serialise state and rebuild the context from the seed on each tick.
      let state = roundTrip(setAutopilot(createRun(42).state, true).state);
      for (let slotIndex = 0; slotIndex <= 19; slotIndex += 1) {
        const context = rebuildContext(42); // fresh, seed-only context — no runtime carry-over
        state = roundTrip(tick(state, context).state);
      }

      expect(JSON.stringify(state)).toBe(JSON.stringify(reference));
    },
  );

  it("still reaches the documented outcome through the round trip", { timeout: SLOW }, () => {
    let state = roundTrip(setAutopilot(createRun(42).state, true).state);
    for (let slotIndex = 0; slotIndex <= 19; slotIndex += 1) {
      state = roundTrip(tick(state, rebuildContext(42)).state);
    }
    const statusOf = (sectorId: string) =>
      state.incidents.find((i) => i.sectorId === sectorId)?.status;
    expect(statusOf("C3")).toBe("verified");
    expect(statusOf("B2")).toBe("verified");
    expect(statusOf("A1")).toBe("closed_logged");
    expect(statusOf("D4")).toBe("closed_logged");
  });
});
