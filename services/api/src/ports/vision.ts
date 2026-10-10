// The vision classification port: the interface the report pipeline depends on to turn a photo into
// a leak judgement. It is implemented by the Bedrock adapter and consumed by the worker; it references
// no `@aws-sdk/*` type so the app layer stays free of SDK coupling (dependency rules, structure.md).

export type VisionLabel =
  "burst" | "sewage_mixing" | "major_leak" | "minor_drip" | "not_a_leak" | "unclear";

export type WaterColour = "clear" | "brown" | "grey" | "unknown";

export type VisionValue = {
  label: VisionLabel;
  confidence: number;
  waterColour: WaterColour;
  reason: string;
};

export type VisionFailureCategory =
  "access_denied" | "model_invalid" | "throttled" | "unparseable_response" | "other";

export type VisionResult =
  | { ok: true; value: VisionValue }
  | { ok: false; category: VisionFailureCategory; errorName?: string };

export interface VisionPort {
  classify(jpeg: Uint8Array): Promise<VisionResult>;
}
