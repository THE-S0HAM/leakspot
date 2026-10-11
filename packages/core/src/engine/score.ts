// Pure priority score for an incident. Deterministic: same input, same P.
// The five documented test vectors (96/39/31/25/80) pin this function exactly; see score.test.ts.

export type VisionLabel =
  "burst" | "sewage_mixing" | "major_leak" | "minor_drip" | "not_a_leak" | "unclear";

/** Severity by label. not_a_leak is rejected before scoring; unclear == major_leak. */
export const SEVERITY: Record<Exclude<VisionLabel, "not_a_leak">, number> = {
  burst: 1.0,
  sewage_mixing: 1.0,
  major_leak: 0.6,
  unclear: 0.6,
  minor_drip: 0.3,
};

export type ScoreBreakdown = { W: number; E: number; C: number; K: number; P: number };

export type ScoreInput = {
  /** mean of the last 2 anomalous slots × 20; 0 when the sector is not suspected/confirmed. */
  excessLitresPerDay: number;
  sectorSuspectedOrConfirmed: boolean;
  /** 0 when there is no photo/report evidence. */
  maxSeverity: number;
  /** photos + low-water reports attached to the incident. */
  evidenceCount: number;
  /** C component inputs. */
  facilityFactor: number; // hospital 1.0 | school 0.7 | trunk-main 0.8 | 0
  sectorConnections: number;
  meterAnomaly: boolean;
  anyConfidentPhoto: boolean;
  /** true when any attached photo was labelled sewage_mixing (health floor). */
  sewageMixing: boolean;
};

/** Compute the {W,E,C,K,P} breakdown. P uses Math.round; sewage_mixing floors P at 80. */
export function scoreIncident(input: ScoreInput): ScoreBreakdown {
  const W = input.sectorSuspectedOrConfirmed ? Math.min(input.excessLitresPerDay / 200000, 1) : 0;

  const E =
    input.evidenceCount > 0
      ? 0.7 * input.maxSeverity + 0.3 * Math.min(input.evidenceCount / 5, 1)
      : 0;

  const C = Math.max(input.facilityFactor, Math.min(input.sectorConnections / 800, 1));

  const K =
    ((input.meterAnomaly ? 1 : 0) +
      (input.evidenceCount > 0 ? 1 : 0) +
      (input.anyConfidentPhoto ? 1 : 0)) /
    3;

  const base = Math.round(100 * (0.4 * W + 0.25 * E + 0.2 * C + 0.15 * K));
  const P = input.sewageMixing ? Math.max(base, 80) : base;

  return { W, E, C, K, P };
}
