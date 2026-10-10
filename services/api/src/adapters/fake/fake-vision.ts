// FakeVision for local dev and tests: classifies by the JPEG byte length so callers get deterministic
// labels without Bedrock. Not used in production (the handler wires the Bedrock adapter).

import type { VisionPort, VisionResult } from "../../ports/vision";

/** A simple deterministic classifier: default burst; empty bytes → unclear fallback trigger. */
export function createFakeVision(
  label: "burst" | "major_leak" | "minor_drip" = "burst",
): VisionPort {
  return {
    async classify(jpeg: Uint8Array): Promise<VisionResult> {
      if (jpeg.length === 0) return { ok: false, category: "other" };
      return { ok: true, value: { label, confidence: 0.95, waterColour: "clear", reason: "fake" } };
    },
  };
}
