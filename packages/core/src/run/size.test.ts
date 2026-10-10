// RunState stays comfortably small even with many citizen reports. 8 KB is a soft target; this asserts
// the full day plus 20 mixed reports (photos + low water across several sectors) ticks to 19:45 with no
// error and stays under the 24 KB test budget. Guards against unbounded growth as 4b adds real reports.

import { describe, expect, it } from "vitest";
import { addReport, createRun, getContext, setAutopilot, tick, type ReportInput } from "./reducers";
import type { RunState } from "./state";

const SECTORS_WITH_POINTS: { sector: string; x: number; z: number }[] = [
  { sector: "C3", x: 14, z: 86 },
  { sector: "B2", x: 86, z: 24 },
  { sector: "A1", x: 10, z: 20 },
  { sector: "D4", x: 90, z: 92 },
  { sector: "C1", x: 10, z: 60 },
];

function reportInputs(): ReportInput[] {
  const inputs: ReportInput[] = [];
  for (let i = 0; i < 20; i += 1) {
    const spot = SECTORS_WITH_POINTS[i % SECTORS_WITH_POINTS.length];
    if (!spot) continue;
    const photo = i % 2 === 0;
    inputs.push(
      photo
        ? {
            id: `C${i}`,
            type: "leak_photo",
            position: { x: spot.x, z: spot.z },
            label: "major_leak",
            confidence: 0.9,
            selfChoice: "flowing",
          }
        : {
            id: `C${i}`,
            type: "low_water",
            position: { x: spot.x, z: spot.z },
            selfChoice: "weak_flow",
          },
    );
  }
  return inputs;
}

describe("RunState size with many citizen reports", () => {
  it("runs the full day + 20 mixed reports with no error and stays under 24 KB", () => {
    const created = createRun(42);
    const context = getContext(42);
    let state: RunState = setAutopilot(created.state, true).state;

    const extra = reportInputs();
    for (let slotIndex = 0; slotIndex <= 19; slotIndex += 1) {
      state = tick(state, context).state;
      // Drip a couple of citizen reports in during the morning window.
      if (slotIndex >= 3 && slotIndex <= 7) {
        for (let k = 0; k < 4; k += 1) {
          const input = extra[(slotIndex - 3) * 4 + k];
          if (input) state = addReport(state, input).state;
        }
      }
    }

    expect(state.clock).toEqual({ day: 15, slotIndex: 19 });
    const bytes = new TextEncoder().encode(JSON.stringify(state)).length;
    expect(bytes).toBeLessThanOrEqual(24576);
  });
});
