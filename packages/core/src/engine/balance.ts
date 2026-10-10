// Water balance and ratio-scaled imputation (domain-engine.md §3). Given a sector's slot readings and
// the per-meter 14-day medians for this slotIndex, impute missing building readings, then compute the
// consumption C, inlet I, unaccounted U and loss ratio L. Pure.

import type { SectorSlotReadings, SectorBalance } from "./types";

const DATA_GAP_THRESHOLD = 0.2; // missingShare > 0.20 → data gap

/**
 * Compute the balance for one sector-slot.
 * @param readings the 15 building readings (null = missing) and the inlet
 * @param medians the per-building 14-day median for this slotIndex (same length/order as buildings)
 */
export function computeBalance(
  readings: SectorSlotReadings,
  medians: readonly number[],
): SectorBalance {
  const buildings = readings.buildings;
  const n = buildings.length;

  // r = Σ observed readings / Σ medians of the observed meters (ratio-scaled imputation).
  let observedSum = 0;
  let observedMedianSum = 0;
  let missingCount = 0;
  for (let i = 0; i < n; i += 1) {
    const reading = buildings[i];
    if (reading === null || reading === undefined) {
      missingCount += 1;
    } else {
      observedSum += reading;
      observedMedianSum += medians[i] ?? 0;
    }
  }
  const r = observedMedianSum > 0 ? observedSum / observedMedianSum : 1;

  let consumption = 0;
  for (let i = 0; i < n; i += 1) {
    const reading = buildings[i];
    consumption += reading === null || reading === undefined ? (medians[i] ?? 0) * r : reading;
  }

  const inlet = readings.inlet;
  const unaccounted = inlet - consumption;
  const lossRatio = inlet > 0 ? unaccounted / inlet : 0;
  const missingShare = n > 0 ? missingCount / n : 0;

  return {
    sectorId: readings.sectorId,
    consumption,
    inlet,
    unaccounted,
    lossRatio,
    missingShare,
    dataGap: missingShare > DATA_GAP_THRESHOLD,
  };
}
