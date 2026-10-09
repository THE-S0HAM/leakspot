// Unit tests for slot/litre conversions and their DomainError cases.
// Verifies the HH:MM slot labels, the lossless L/h <-> L/slot round-trip, and
// that every out-of-domain input throws a DomainError naming the rejected value.

import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  labelToSlotIndex,
  litresPerHourToPerSlot,
  litresPerSlotToPerHour,
  slotIndexToLabel,
} from "./units";

describe("slotIndexToLabel / labelToSlotIndex", () => {
  it("round-trips every one of the 20 slot indices through its label", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(labelToSlotIndex(slotIndexToLabel(i))).toBe(i);
    }
  });

  it("maps the morning and evening boundary slots to their start labels", () => {
    expect(slotIndexToLabel(0)).toBe("06:00");
    expect(slotIndexToLabel(11)).toBe("08:45");
    expect(slotIndexToLabel(12)).toBe("18:00");
    expect(slotIndexToLabel(19)).toBe("19:45");
  });

  it("rejects a non-integer or out-of-range slot index, naming the value", () => {
    for (const bad of [-1, 20, 1.5, NaN]) {
      try {
        slotIndexToLabel(bad);
        expect.unreachable(`expected slotIndexToLabel(${bad}) to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).message).toContain(String(bad));
      }
    }
  });

  it("rejects a label that is not one of the 20 supply-slot labels, naming it", () => {
    for (const bad of ["05:45", "09:00", "6:00", "06:10"]) {
      try {
        labelToSlotIndex(bad);
        expect.unreachable(`expected labelToSlotIndex(${bad}) to throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).message).toContain(bad);
      }
    }
  });
});

describe("litresPerHourToPerSlot / litresPerSlotToPerHour", () => {
  it("round-trips flows losslessly through a slot and back, including non-integers", () => {
    for (const x of [0, 1000, 2.5]) {
      expect(litresPerSlotToPerHour(litresPerHourToPerSlot(x))).toBe(x);
    }
  });

  it("converts the reference flows exactly", () => {
    expect(litresPerHourToPerSlot(1000)).toBe(250);
    expect(litresPerSlotToPerHour(250)).toBe(1000);
    expect(litresPerHourToPerSlot(0)).toBe(0);
    expect(litresPerSlotToPerHour(0)).toBe(0);
  });

  it("rejects negative, NaN and infinite flows in both conversions, naming the value", () => {
    for (const bad of [-1, NaN, Infinity, -Infinity]) {
      for (const convert of [litresPerHourToPerSlot, litresPerSlotToPerHour]) {
        try {
          convert(bad);
          expect.unreachable(`expected ${convert.name}(${bad}) to throw`);
        } catch (error) {
          expect(error).toBeInstanceOf(DomainError);
          expect((error as DomainError).message).toContain(String(bad));
        }
      }
    }
  });
});
