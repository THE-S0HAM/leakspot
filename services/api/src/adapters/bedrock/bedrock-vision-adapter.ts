// Bedrock vision adapter: classifies one leak photo with the Bedrock Runtime Converse API
// (https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html). It holds the only
// copy of the system prompt and the reply parser, so the probe and the worker share identical logic.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { Config } from "../../config";
import type {
  VisionFailureCategory,
  VisionLabel,
  VisionPort,
  VisionResult,
  VisionValue,
  WaterColour,
} from "../../ports/vision";

export type BedrockModelId = Config["bedrockModelId"];

const LABELS = [
  "burst",
  "sewage_mixing",
  "major_leak",
  "minor_drip",
  "not_a_leak",
  "unclear",
] as const satisfies readonly VisionLabel[];

const WATER_COLOURS = [
  "clear",
  "brown",
  "grey",
  "unknown",
] as const satisfies readonly WaterColour[];

// Record<VisionLabel, …> makes the compiler insist on a definition for every label in the port.
const LABEL_DEFINITIONS: Record<VisionLabel, string> = {
  burst:
    "a strong gush or fountain from a broken pipe or main, or clean water flowing fast across a road from a broken pipe.",
  sewage_mixing:
    "dark, grey or foamy water that looks or likely smells like sewage, mixing with or leaking from supply pipes.",
  major_leak:
    "a steady stream from a pipe, joint or valve, clearly more than drips, but not a gushing burst.",
  minor_drip: "slow drops from a tap, fitting or joint.",
  not_a_leak:
    "water in use on purpose (washing a vehicle, watering plants, a running hose or tap in use) or no leaking water visible.",
  unclear: "the photo is too dark, blurred or unrelated to judge.",
};

const MAX_REASON_LENGTH = 120;

export const SYSTEM_PROMPT = [
  "You check photos that residents send when they think they see a leak in the city water supply.",
  "Choose exactly one label:",
  ...LABELS.map((label) => `- ${label}: ${LABEL_DEFINITIONS[label]}`),
  `waterColour: one of ${WATER_COLOURS.join(", ")} (unknown if no water is visible or its colour cannot be judged).`,
  "confidence: a number in the range 0–1 (0 to 1 inclusive) for how sure you are of the label.",
  `reason: a short plain description of what you see, at most ${MAX_REASON_LENGTH} characters.`,
  "Reply with exactly one JSON object and no other text (no markdown, no code fence):",
  '{"label":"<label>","confidence":<number>,"waterColour":"<colour>","reason":"<text>"}',
].join("\n");

const INSTRUCTION_TEXT = "Classify this photo.";
const RETRY_TEXT = "Return only the JSON object.";

const replySchema = z.object({
  label: z.enum(LABELS),
  confidence: z.number().min(0).max(1),
  waterColour: z.enum(WATER_COLOURS),
  reason: z.string(),
});

/**
 * Extract the first balanced {...} JSON object from arbitrary model text. Tolerates markdown code
 * fences, leading/trailing prose and a reasoning block before the JSON (Nova and others sometimes emit
 * these despite the "one JSON object only" instruction). Scans for the first "{" and tracks brace depth,
 * ignoring braces inside strings. Returns the substring or null.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parses a model reply into a VisionValue, or null when no valid object is present. Takes the first
 * {...} object out of the text (so code fences, prose and reasoning blocks are tolerated), parses it,
 * and validates with zod. Extra fields are dropped and `reason` is cut to 120 chars.
 */
export function parseVisionReply(text: string): VisionValue | null {
  const body = extractFirstJsonObject(text);
  if (body === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const result = replySchema.safeParse(parsed);
  if (!result.success) return null;

  const { label, confidence, waterColour, reason } = result.data;
  return { label, confidence, waterColour, reason: truncateReason(reason) };
}

function truncateReason(reason: string): string {
  if (reason.length <= MAX_REASON_LENGTH) return reason;
  // Never split a surrogate pair: a lone surrogate cannot be stored or displayed as valid UTF-8.
  const lastUnit = reason.charCodeAt(MAX_REASON_LENGTH - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return reason.slice(0, isHighSurrogate ? MAX_REASON_LENGTH - 1 : MAX_REASON_LENGTH);
}

/**
 * Builds the Converse input. Pure, so primary and fallback model ids provably differ only in `modelId`.
 * The jpeg bytes are passed through untouched; the SDK base64-encodes them on the wire.
 */
export function buildConverseInput(
  modelId: BedrockModelId,
  jpeg: Uint8Array,
  retry: boolean,
): ConverseCommandInput {
  const content: ContentBlock[] = [
    { image: { format: "jpeg", source: { bytes: jpeg } } },
    { text: INSTRUCTION_TEXT },
  ];
  if (retry) content.push({ text: RETRY_TEXT });

  return {
    modelId,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content }],
    inferenceConfig: { temperature: 0, maxTokens: 200 },
  };
}

// The reply may hold non-text blocks (for example reasoning); only text blocks carry the JSON.
function replyText(output: ConverseCommandOutput): string | null {
  const blocks = output.output?.message?.content ?? [];
  const texts = blocks.flatMap((block) => (typeof block.text === "string" ? [block.text] : []));
  return texts.length === 0 ? null : texts.join("");
}

// A Map (not an object literal) so names such as "constructor" never hit Object.prototype.
const CATEGORY_BY_ERROR_NAME: ReadonlyMap<string, VisionFailureCategory> = new Map([
  ["AccessDeniedException", "access_denied"],
  ["ValidationException", "model_invalid"],
  ["ResourceNotFoundException", "model_invalid"],
  ["ThrottlingException", "throttled"],
]);

// Builds a fresh result from the error name only, so no request, image bytes or credentials leak out,
// and logs the category/name/message (never the photo bytes) so a failure is visible in CloudWatch.
function failureFromError(error: unknown): VisionResult {
  if (!(error instanceof Error)) {
    console.error("[bedrock-vision] classify failed: category=other (non-Error thrown)");
    return { ok: false, category: "other" };
  }
  const name: unknown = error.name;
  const resolvedName = typeof name === "string" ? name : "UnknownError";
  const category = CATEGORY_BY_ERROR_NAME.get(resolvedName) ?? "other";
  console.error(
    `[bedrock-vision] classify failed: category=${category} name=${resolvedName} message=${error.message}`,
  );
  return { ok: false, category, errorName: resolvedName };
}

export type BedrockVisionAdapterOptions = {
  /** Injected for tests/probe; the handler omits it and gets a default client built here. */
  client?: BedrockRuntimeClient;
  modelId: BedrockModelId;
};

export type ProbeResult = { rawText: string; parsed: VisionValue | null };

/**
 * Diagnostic one-shot Converse that returns the model's raw reply text and the parse result. Used by
 * scripts/probe-bedrock.ts so the probe never imports @aws-sdk directly (dependency rules). Builds its
 * own client (optionally for a given region) so it exercises the same request path as the adapter.
 */
export async function probeConverse(
  modelId: BedrockModelId,
  jpeg: Uint8Array,
  region = "ap-south-1",
): Promise<ProbeResult> {
  const client = new BedrockRuntimeClient({ region });
  const output = await client.send(new ConverseCommand(buildConverseInput(modelId, jpeg, false)));
  const rawText = replyText(output) ?? "";
  return { rawText, parsed: parseVisionReply(rawText) };
}

/**
 * Creates the VisionPort backed by Bedrock Converse. The client may be injected (tests mock it; the
 * probe builds one for its own profile), or defaulted here so handlers never import @aws-sdk directly
 * (dependency rules). `classify` never rejects.
 */
export function createBedrockVisionAdapter(options: BedrockVisionAdapterOptions): VisionPort {
  const client = options.client ?? new BedrockRuntimeClient({});
  const { modelId } = options;

  // Resolves to a final result (success or thrown-error failure), or null when the reply did not parse.
  async function attempt(jpeg: Uint8Array, retry: boolean): Promise<VisionResult | null> {
    try {
      const output = await client.send(
        new ConverseCommand(buildConverseInput(modelId, jpeg, retry)),
      );
      const text = replyText(output);
      const value = text === null ? null : parseVisionReply(text);
      return value === null ? null : { ok: true, value };
    } catch (error) {
      return failureFromError(error);
    }
  }

  return {
    async classify(jpeg: Uint8Array): Promise<VisionResult> {
      const first = await attempt(jpeg, false);
      if (first !== null) return first;
      const retried = await attempt(jpeg, true);
      if (retried !== null) return retried;
      console.error(
        "[bedrock-vision] classify failed: category=unparseable_response (model reply had no valid JSON object after retry)",
      );
      return { ok: false, category: "unparseable_response" };
    },
  };
}
