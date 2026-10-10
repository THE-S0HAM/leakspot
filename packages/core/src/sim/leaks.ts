// Active-leak bookkeeping (ground truth, sim/ only). Tracks which scripted leaks are active and lets
// the sim compute per-sector leak volume for a slot and decide which leak a repair fixes
// (domain-engine.md §8). The engine never imports this.

import { distance, type Point, type SectorId } from "../world/jaldhara";
import { SCRIPTED_LEAKS, type ScriptedLeak } from "./script";

const SLOT_HOURS = 0.25;
const REPAIR_RADIUS_UNITS = 8;

/** Runtime leak = a scripted leak plus whether it has been repaired (and extra injected leaks). */
export type ActiveLeak = {
  id: string;
  sector: SectorId;
  position: Point;
  litresPerHour: number;
  visible: boolean;
  startDay: number;
  startSlot: number;
  repaired: boolean;
};

/** Build the initial active-leak list from the script (none repaired). */
export function initialLeaks(): ActiveLeak[] {
  return SCRIPTED_LEAKS.map((l: ScriptedLeak) => ({ ...l, repaired: false }));
}

/** Has the leak started on or before (day, slotIndex)? (startDay/startSlot ordering) */
export function hasStarted(leak: ActiveLeak, day: number, slotIndex: number): boolean {
  if (day > leak.startDay) return true;
  if (day < leak.startDay) return false;
  return slotIndex >= leak.startSlot;
}

/** Total leak volume (litres) active in a sector this supply slot. */
export function sectorLeakVolume(
  leaks: readonly ActiveLeak[],
  sectorId: SectorId,
  day: number,
  slotIndex: number,
): number {
  let litresPerHour = 0;
  for (const leak of leaks) {
    if (leak.sector === sectorId && !leak.repaired && hasStarted(leak, day, slotIndex)) {
      litresPerHour += leak.litresPerHour;
    }
  }
  return litresPerHour * SLOT_HOURS;
}

/** Visible leaks (for the 3D world) that are active and unrepaired at (day, slotIndex). */
export function visibleActiveLeaks(
  leaks: readonly ActiveLeak[],
  day: number,
  slotIndex: number,
): { x: number; z: number; size: number }[] {
  return leaks
    .filter((l) => l.visible && !l.repaired && hasStarted(l, day, slotIndex))
    .map((l) => ({ x: l.position.x, z: l.position.z, size: l.litresPerHour }));
}

/**
 * Repair the ground-truth leak an engineer fixes at `pin` in `sectorId` (domain-engine.md §8): the
 * largest active leak in the sector within 8 units of the pin; for a hidden pin, the largest hidden
 * leak in the sector. Mutates and returns the repaired leak id, or undefined if none matched.
 */
export function repairLeakAt(
  leaks: ActiveLeak[],
  sectorId: SectorId,
  pin: Point,
  hidden: boolean,
): string | undefined {
  const inSector = leaks.filter((l) => l.sector === sectorId && !l.repaired);

  // Primary rule: the largest active leak in the sector within 8 units of the pin.
  const nearPin = inSector
    .filter((l) => distance(l.position, pin) <= REPAIR_RADIUS_UNITS)
    .sort((a, b) => b.litresPerHour - a.litresPerHour);
  let target = nearPin[0];

  // Fallback for a hidden pin (acoustic survey): the largest hidden leak in the sector.
  if (!target && hidden) {
    target = inSector
      .filter((l) => !l.visible)
      .sort((a, b) => b.litresPerHour - a.litresPerHour)[0];
  }

  if (!target) return undefined;
  target.repaired = true;
  return target.id;
}
