// Active-leak ground truth (sim/ only; the engine never imports this). The leak definitions are pure
// seed-derived data (positions, sizes, start slots) and carry NO runtime state. Which leaks have been
// repaired lives in RunState (a set of ids), so a context rebuilt from the seed on a fresh Lambda is
// identical every time and all runtime facts round-trip through DynamoDB.

import { distance, type Point, type SectorId } from "../world/jaldhara";
import { SCRIPTED_LEAKS, type ScriptedLeak } from "./script";

const SLOT_HOURS = 0.25;
const REPAIR_RADIUS_UNITS = 8;

/** A leak definition: scripted ground truth with no runtime (repaired) state. */
export type LeakDef = {
  id: string;
  sector: SectorId;
  position: Point;
  litresPerHour: number;
  visible: boolean;
  startDay: number;
  startSlot: number;
};

/** The pure leak definitions for a run (seed-derived; held in the context). */
export function leakDefs(): LeakDef[] {
  return SCRIPTED_LEAKS.map((l: ScriptedLeak) => ({ ...l }));
}

/** Has the leak started on or before (day, slotIndex)? (startDay/startSlot ordering) */
export function hasStarted(leak: LeakDef, day: number, slotIndex: number): boolean {
  if (day > leak.startDay) return true;
  if (day < leak.startDay) return false;
  return slotIndex >= leak.startSlot;
}

/** Total leak volume (litres) active in a sector this supply slot, excluding repaired leaks. */
export function sectorLeakVolume(
  leaks: readonly LeakDef[],
  repairedIds: ReadonlySet<string>,
  sectorId: SectorId,
  day: number,
  slotIndex: number,
): number {
  let litresPerHour = 0;
  for (const leak of leaks) {
    if (leak.sector === sectorId && !repairedIds.has(leak.id) && hasStarted(leak, day, slotIndex)) {
      litresPerHour += leak.litresPerHour;
    }
  }
  return litresPerHour * SLOT_HOURS;
}

/** Visible, unrepaired leaks active at (day, slotIndex) for the 3D world. */
export function visibleActiveLeaks(
  leaks: readonly LeakDef[],
  repairedIds: ReadonlySet<string>,
  day: number,
  slotIndex: number,
): { x: number; z: number; size: number }[] {
  return leaks
    .filter((l) => l.visible && !repairedIds.has(l.id) && hasStarted(l, day, slotIndex))
    .map((l) => ({ x: l.position.x, z: l.position.z, size: l.litresPerHour }));
}

/**
 * The ground-truth leak an engineer fixes at `pin` in `sectorId`: the largest
 * active leak in the sector within 8 units of the pin; for a hidden pin, the largest hidden leak in
 * the sector. Pure — returns the leak id to mark repaired in RunState, or undefined if none matched.
 */
export function leakRepairedBy(
  leaks: readonly LeakDef[],
  repairedIds: ReadonlySet<string>,
  sectorId: SectorId,
  pin: Point,
  hidden: boolean,
): string | undefined {
  const inSector = leaks.filter((l) => l.sector === sectorId && !repairedIds.has(l.id));

  const nearPin = inSector
    .filter((l) => distance(l.position, pin) <= REPAIR_RADIUS_UNITS)
    .sort((a, b) => b.litresPerHour - a.litresPerHour);
  let target = nearPin[0];

  if (!target && hidden) {
    target = inSector
      .filter((l) => !l.visible)
      .sort((a, b) => b.litresPerHour - a.litresPerHour)[0];
  }

  return target?.id;
}
