// Slot and litre conversions: the single place that maps supply-slot indices to
// their HH:MM start labels and converts flows between litres-per-hour and
// litres-per-slot (1 slot = 15 min). Every layer shares these so times and
// volumes agree.

import { DomainError } from "./errors";

// Supply runs 06:00-09:00 (slots 0-11) and 18:00-20:00 (slots 12-19): 20 slots/day.
const SLOTS_PER_DAY = 20;
const MORNING_SLOTS = 12;
const MORNING_START_MIN = 6 * 60; // 06:00
const EVENING_START_MIN = 18 * 60; // 18:00
const MINUTES_PER_SLOT = 15;

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Return the zero-padded 24-hour HH:MM start label for an integer slot 0..19. */
export function slotIndexToLabel(slotIndex: number): string {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS_PER_DAY) {
    throw new DomainError(`slotIndex must be an integer in 0..19, got ${slotIndex}`);
  }
  const startMin =
    slotIndex < MORNING_SLOTS
      ? MORNING_START_MIN + MINUTES_PER_SLOT * slotIndex
      : EVENING_START_MIN + MINUTES_PER_SLOT * (slotIndex - MORNING_SLOTS);
  const hours = Math.floor(startMin / 60);
  const minutes = startMin % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

/** Return the slot index for one of the 20 labels slotIndexToLabel produces. */
export function labelToSlotIndex(label: string): number {
  for (let slotIndex = 0; slotIndex < SLOTS_PER_DAY; slotIndex += 1) {
    if (slotIndexToLabel(slotIndex) === label) {
      return slotIndex;
    }
  }
  throw new DomainError(`label is not a valid supply-slot label, got ${label}`);
}

function assertFiniteNonNegative(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError(`flow must be a non-negative finite number, got ${value}`);
  }
}

/** Convert a flow in litres per hour to litres per slot (15 min): lph * 0.25. */
export function litresPerHourToPerSlot(lph: number): number {
  assertFiniteNonNegative(lph);
  return lph * 0.25;
}

/** Convert a volume in litres per slot (15 min) to litres per hour: lps * 4. */
export function litresPerSlotToPerHour(lps: number): number {
  assertFiniteNonNegative(lps);
  return lps * 4;
}
