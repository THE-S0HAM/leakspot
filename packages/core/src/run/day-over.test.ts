// The scenario is one day: after day 15 slot 19 (20:00) the day is over and tick must refuse.
import { describe, expect, it } from "vitest";
import { createRun, getContext, isDayOver, tick, DomainConflict } from "./reducers";

describe("end of day 15", () => {
  it("ticks through the whole day then refuses with DomainConflict", () => {
    const { state } = createRun(42);
    const context = getContext(42);
    let s = state;
    // 20 supply slots (0–19) complete the day; the run starts at slot -1.
    for (let i = 0; i < 20; i += 1) {
      expect(isDayOver(s)).toBe(false);
      s = tick(s, context).state;
    }
    expect(s.clock).toEqual({ day: 15, slotIndex: 19 });
    expect(isDayOver(s)).toBe(true);
    expect(() => tick(s, context)).toThrow(DomainConflict);
    expect(() => tick(s, context)).toThrow(/day is over/i);
  });
});
