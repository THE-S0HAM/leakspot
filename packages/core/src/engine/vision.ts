// Vision label handling (domain-engine.md §5): map a resolved label (from Bedrock, cache, or the
// citizen's self-choice) to a severity, a "confident photo" flag and whether the report is rejected.
// Pure. The run reducer and the API share this so FakeVision and real Bedrock behave identically.

import { SEVERITY, type VisionLabel } from "./score";

export type ResolvedLabel = {
  label: VisionLabel;
  confidence: number;
  severity: number;
  rejected: boolean;
  /** a photo counts as "confident" for the K component when confidence ≥ 0.6 and not rejected. */
  confident: boolean;
  sewageMixing: boolean;
};

const CONFIDENCE_FLOOR = 0.6;

/**
 * Resolve a photo label into engine terms. `confidence < 0.6` demotes a definite label to `unclear`
 * (treated as major_leak, confidence 0, unverified). `not_a_leak` → rejected.
 */
export function resolvePhotoLabel(label: VisionLabel, confidence: number): ResolvedLabel {
  if (label === "not_a_leak") {
    return {
      label,
      confidence,
      severity: 0,
      rejected: true,
      confident: false,
      sewageMixing: false,
    };
  }

  // Low confidence on a definite label → unclear (major_leak severity, confidence 0).
  const effective: Exclude<VisionLabel, "not_a_leak"> =
    confidence < CONFIDENCE_FLOOR ? "unclear" : label;
  const resolvedConfidence = confidence < CONFIDENCE_FLOOR ? 0 : confidence;

  return {
    label: effective,
    confidence: resolvedConfidence,
    severity: SEVERITY[effective],
    rejected: false,
    confident: resolvedConfidence >= CONFIDENCE_FLOOR,
    sewageMixing: effective === "sewage_mixing",
  };
}

/** Self-reported fallback when Bedrock is unavailable/capped (confidence 0, not confident). */
export function resolveSelfReported(selfChoice: "flowing" | "dripping"): ResolvedLabel {
  const label: VisionLabel = selfChoice === "flowing" ? "major_leak" : "minor_drip";
  return {
    label,
    confidence: 0,
    severity: SEVERITY[label],
    rejected: false,
    confident: false,
    sewageMixing: false,
  };
}
