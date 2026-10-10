// Resolve a leak photo to an engine label via the vision port, with the self-reported fallback when
// Bedrock is unavailable (api-contract.md §5). Pure orchestration over the injected VisionPort.

import type { VisionLabel } from "@leakspot/core";
import type { VisionPort } from "../ports/vision";

export type ResolvedVision = {
  /** label shown to the citizen/engineer (may be "self_reported"). */
  label: string;
  /** the engine vision label passed to addReport. */
  engineLabel: VisionLabel;
  confidence: number;
  selfReported: boolean;
  /** why we fell back to self-reported (the vision failure category), if we did. */
  fallbackReason?: string;
};

/** Classify a JPEG; on any vision failure, fall back to the citizen's self-choice (confidence 0). */
export async function resolveVision(
  vision: VisionPort,
  jpeg: Uint8Array,
  selfChoice: "flowing" | "dripping",
): Promise<ResolvedVision> {
  const result = await vision.classify(jpeg);
  if (result.ok) {
    return {
      label: result.value.label,
      engineLabel: result.value.label,
      confidence: result.value.confidence,
      selfReported: false,
    };
  }
  // Fallback: flowing → major_leak, dripping → minor_drip, confidence 0, marked self-reported.
  return {
    label: "self_reported",
    engineLabel: selfChoice === "dripping" ? "minor_drip" : "major_leak",
    confidence: 0,
    selfReported: true,
    fallbackReason: result.category,
  };
}
