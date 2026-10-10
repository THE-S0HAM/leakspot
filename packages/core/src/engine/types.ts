// Observable inputs and derived outputs shared across engine/ (and produced by sim/). These describe
// what the meters report — never ground truth. engine/ must not import sim/, so the sim produces values
// of these types and the engine consumes them.

import type { SectorId } from "../world/jaldhara";

/** What a sector's meters report in one slot: 15 building readings (null = missing) + the inlet. */
export type SectorSlotReadings = {
  sectorId: SectorId;
  /** length 15; null entries are missing readings (p = 0.02 each). */
  buildings: readonly (number | null)[];
  inlet: number;
};

/** Per-sector per-slot balance derived from readings (domain-engine.md §3). */
export type SectorBalance = {
  sectorId: SectorId;
  consumption: number; // C = Σ building readings (observed + imputed)
  inlet: number; // I
  unaccounted: number; // U = I − C
  lossRatio: number; // L = U / I
  missingShare: number; // fraction of the 15 building readings missing
  dataGap: boolean; // missingShare > 0.20
};

/** Baseline statistics for a sector at a given slotIndex, from days 1–14. */
export type SectorBaseline = { median: number; scale: number };

export type SectorStatus =
  "normal" | "watch" | "suspected" | "confirmed" | "data_gap" | "verifying" | "verified";
