// The scenario is one day: after day 15 slot 19 (20:00) the day is over and tick must refuse. tickMany
// clamps a batch to the slots left so a fast-speed tick near 20:00 lands on 19:45 instead of failing.
import { describe, expect, it } from "vitest";
import { createRun, getContext, isDayOver, tick, tickMany, DomainConflict } from "./reducers";

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

  it("clamps a 4× tick from 19:15 (slot 17) to land on 19:45 (slot 19), then 409s", () => {
    const { state } = createRun(42);
    const context = getContext(42);
    let s = state;
    // Advance to slot 17 (19:15): run starts at -1, so 18 ticks reach slot 17.
    for (let i = 0; i < 18; i += 1) s = tick(s, context).state;
    expect(s.clock).toEqual({ day: 15, slotIndex: 17 });
    expect(s.clockLabel).toBe("19:15");

    // A 4× batch has only 2 slots left (18, 19): it clamps and lands on 19:45.
    s = tickMany(s, context, 4).state;
    expect(s.clock).toEqual({ day: 15, slotIndex: 19 });
    expect(s.clockLabel).toBe("19:45");

    // The next tick (any count) now has zero slots left → DomainConflict.
    expect(() => tickMany(s, context, 4)).toThrow(/day is over/i);
  });
});
