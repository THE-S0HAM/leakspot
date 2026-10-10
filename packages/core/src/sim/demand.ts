// Demand model (domain-engine.md §2): per-connection daily volume split across the 20 supply slots by
// fixed weights (normalised to sum 1), with a Sunday multiplier, and a seeded split of a sector's
// connections across its 15 building meters. Pure and deterministic.

import { BUILDING_METERS_PER_SECTOR } from "../world/jaldhara";
import { hashString, mulberry32 } from "./rng";

export const SLOTS_PER_DAY = 20;
export const LITRES_PER_CONNECTION_PER_DAY = 600;
const SUNDAY_MULTIPLIER = 1.05;

const MORNING_WEIGHTS = [1.6, 1.5, 1.3, 1.2, 1.1, 1.0, 0.9, 0.9, 0.8, 0.8, 0.7, 0.7] as const;
const EVENING_WEIGHTS = [1.5, 1.4, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7] as const;

// Normalised slot weights (sum to 1) across the 20 supply slots: 12 morning then 8 evening.
export const SLOT_WEIGHTS: readonly number[] = (() => {
  const raw = [...MORNING_WEIGHTS, ...EVENING_WEIGHTS];
  const total = raw.reduce((sum, w) => sum + w, 0);
  return raw.map((w) => w / total);
})();

/** weekday 0 = Monday (domain-engine.md §1): day 1 Monday, days 7 & 14 Sunday. */
export function weekday(day: number): number {
  return (((day - 1) % 7) + 7) % 7;
}

export function isSunday(day: number): boolean {
  return weekday(day) === 6;
}

/** Demand per connection for one slot of a given day (litres). */
export function connectionDemand(day: number, slotIndex: number): number {
  const weight = SLOT_WEIGHTS[slotIndex];
  if (weight === undefined) throw new RangeError(`slotIndex out of range: ${slotIndex}`);
  const dayFactor = isSunday(day) ? SUNDAY_MULTIPLIER : 1;
  return LITRES_PER_CONNECTION_PER_DAY * weight * dayFactor;
}

/**
 * Split a sector's connections across its 15 building meters by seeded weights that sum back to the
 * total. Deterministic in the run seed and sector id, so a building keeps the same size every run.
 */
export function buildingConnectionShares(
  seed: number,
  sectorId: string,
  connections: number,
): number[] {
  const rng = mulberry32(hashString(`${seed}|${sectorId}|building-split`));
  const weights = Array.from({ length: BUILDING_METERS_PER_SECTOR }, () => 0.5 + rng());
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => (w / total) * connections);
}
