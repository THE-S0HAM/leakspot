// Precompute per-sector baselines and per-building medians from days 1–14 (no leaks). This lives in
// run/ (not engine/) because it drives the sim to generate history; the engine only consumes the
// resulting baselines and medians. Recomputed on createRun, never stored (deadline-mode). Pure in seed.

import { SECTORS, type SectorId } from "../world/jaldhara";
import { computeBaseline } from "../engine/baseline";
import { computeBalance } from "../engine/balance";
import { median } from "../engine/stats";
import type { SectorBaseline } from "../engine/types";
import { SLOTS_PER_DAY } from "../sim/demand";
import { generateSectorReadings } from "../sim/readings";

const HISTORY_DAYS = 14;

/** Baselines keyed by `${sectorId}#${slotIndex}` and per-building medians for imputation. */
export type HistoryModel = {
  baseline: Map<string, SectorBaseline>;
  /** per-building 14-day median for a sector-slot: key `${sectorId}#${slotIndex}` → number[15]. */
  buildingMedians: Map<string, number[]>;
};

function key(sectorId: SectorId, slotIndex: number): string {
  return `${sectorId}#${slotIndex}`;
}

/**
 * Build the history model for a seed by simulating 14 leak-free days. For each sector-slot we need the
 * per-building medians (for imputation) and the baseline of the loss ratio L. L itself depends on
 * imputation, so we impute within history using a two-pass approach: first collect per-building medians
 * across the 14 days, then recompute each day's balance with those medians to get the L history.
 */
export function buildHistoryModel(seed: number): HistoryModel {
  // Pass 1: collect raw building readings and inlets per sector-slot across the 14 days.
  const buildingSeries = new Map<string, number[][]>(); // key → per-building arrays of observed values
  const slotReadings = new Map<string, { buildings: (number | null)[]; inlet: number }[]>();

  for (const sector of SECTORS) {
    for (let slotIndex = 0; slotIndex < SLOTS_PER_DAY; slotIndex += 1) {
      const k = key(sector.id, slotIndex);
      const perBuilding: number[][] = Array.from({ length: 15 }, () => []);
      const readings: { buildings: (number | null)[]; inlet: number }[] = [];
      for (let day = 1; day <= HISTORY_DAYS; day += 1) {
        const r = generateSectorReadings(seed, day, slotIndex, sector, 0);
        readings.push({ buildings: [...r.buildings], inlet: r.inlet });
        for (let b = 0; b < r.buildings.length; b += 1) {
          const value = r.buildings[b];
          if (value !== null && value !== undefined) perBuilding[b]?.push(value);
        }
      }
      buildingSeries.set(k, perBuilding);
      slotReadings.set(k, readings);
    }
  }

  // Per-building medians per sector-slot.
  const buildingMedians = new Map<string, number[]>();
  for (const [k, perBuilding] of buildingSeries) {
    buildingMedians.set(
      k,
      perBuilding.map((series) => median(series)),
    );
  }

  // Pass 2: recompute each day's L with those medians, then baseline over the 14 Ls.
  const baseline = new Map<string, SectorBaseline>();
  for (const sector of SECTORS) {
    for (let slotIndex = 0; slotIndex < SLOTS_PER_DAY; slotIndex += 1) {
      const k = key(sector.id, slotIndex);
      const medians = buildingMedians.get(k) ?? [];
      const readings = slotReadings.get(k) ?? [];
      const lossRatios = readings.map(
        (r) =>
          computeBalance({ sectorId: sector.id, buildings: r.buildings, inlet: r.inlet }, medians)
            .lossRatio,
      );
      baseline.set(k, computeBaseline(lossRatios));
    }
  }

  return { baseline, buildingMedians };
}

export function baselineKey(sectorId: SectorId, slotIndex: number): string {
  return key(sectorId, slotIndex);
}
