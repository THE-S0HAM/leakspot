// Baseline and anomaly detection (domain-engine.md §4). Baselines are the median and MAD-scaled spread
// of the loss ratio L per sector per slotIndex over days 1–14; a slot is anomalous when z ≥ 3 and the
// excess ratio ≥ 0.08. Pure. Baselines are recomputed from history, never stored (deadline-mode).

import { mad, median } from "./stats";
import type { SectorBaseline } from "./types";

const Z_THRESHOLD = 3;
const EXCESS_THRESHOLD = 0.08;
const MAD_TO_SIGMA = 1.4826;
const MIN_SCALE = 0.005;

/** Baseline for one sector-slot from the history of loss ratios L at that slotIndex. */
export function computeBaseline(historyLossRatios: readonly number[]): SectorBaseline {
  const med = median(historyLossRatios);
  const scale = Math.max(MAD_TO_SIGMA * mad(historyLossRatios), MIN_SCALE);
  return { median: med, scale };
}

export type AnomalyResult = {
  z: number;
  excessRatio: number;
  anomalous: boolean;
  /** excessLitresPerSlot = excessRatio × I / (1 − median) (domain-engine.md §4). */
  excessLitresPerSlot: number;
};

/** Evaluate a slot's loss ratio L against its baseline. */
export function evaluateAnomaly(
  lossRatio: number,
  inlet: number,
  baseline: SectorBaseline,
): AnomalyResult {
  const z = (lossRatio - baseline.median) / baseline.scale;
  const excessRatio = lossRatio - baseline.median;
  const anomalous = z >= Z_THRESHOLD && excessRatio >= EXCESS_THRESHOLD;
  const denom = 1 - baseline.median;
  const excessLitresPerSlot = denom > 0 ? (excessRatio * inlet) / denom : 0;
  return { z, excessRatio, anomalous, excessLitresPerSlot };
}
