// Adapter tests for the Bedrock vision adapter: Converse request shape, the single retry, reply parsing and
// thrown-error mapping (Req 12). The SDK client is real but its `send` is replaced by aws-sdk-client-mock,
// so no test touches the network or AWS.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { VisionLabel, VisionValue, WaterColour } from "../../ports/vision";
import {
  SYSTEM_PROMPT,
  buildConverseInput,
  createBedrockVisionAdapter,
  parseVisionReply,
  type BedrockModelId,
} from "./bedrock-vision-adapter";

const PRIMARY_MODEL_ID: BedrockModelId = "global.amazon.nova-2-lite-v1:0";
const FALLBACK_MODEL_ID: BedrockModelId = "apac.amazon.nova-lite-v1:0";
const RETRY_TEXT = "Return only the JSON object.";

// Record<…, true> makes the compiler insist every label and colour of the port is listed here.
const LABEL_SET: Record<VisionLabel, true> = {
  burst: true,
  sewage_mixing: true,
  major_leak: true,
  minor_drip: true,
  not_a_leak: true,
  unclear: true,
};
const COLOUR_SET: Record<WaterColour, true> = {
  clear: true,
  brown: true,
  grey: true,
  unknown: true,
};
const LABELS = Object.keys(LABEL_SET) as VisionLabel[];
const COLOURS = Object.keys(COLOUR_SET) as WaterColour[];

const VALID_VALUE: VisionValue = {
  label: "major_leak",
  confidence: 0.82,
  waterColour: "clear",
  reason: "Steady stream from a pipe joint onto the pavement.",
};

// Fake credentials are assembled at runtime so the file holds nothing shaped like an AWS key.
const client = new BedrockRuntimeClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: ["test", "id"].join("-"),
    secretAccessKey: ["test", "secret"].join("-"),
  },
});
const mock = mockClient(BedrockRuntimeClient);

beforeEach(() => {
  mock.reset();
});

afterAll(() => {
  mock.restore();
});

// The smallest byte sequence with JPEG start and end markers; the adapter never decodes it.
function makeJpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
}

function reply(text: string): Omit<ConverseCommandOutput, "$metadata"> {
  return {
    output: { message: { role: "assistant", content: [{ text }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  };
}

function awsError(name: string): Error {
  const error = new Error(`${name} raised by the mocked client`);
  error.name = name;
  return error;
}

function adapterFor(modelId: BedrockModelId = PRIMARY_MODEL_ID) {
  return createBedrockVisionAdapter({ client, modelId });
}

function callCount(): number {
  return mock.commandCalls(ConverseCommand).length;
}

function sentInput(index: number): ConverseCommandInput {
  const call = mock.commandCalls(ConverseCommand)[index];
  if (call === undefined) throw new Error(`expected a Converse call at index ${index}`);
  return call.args[0].input;
}

function userContent(input: ConverseCommandInput) {
  const message = input.messages?.[0];
  if (message === undefined) throw new Error("expected a user message");
  return message.content ?? [];
}

describe("createBedrockVisionAdapter request shape", () => {
  it.each([PRIMARY_MODEL_ID, FALLBACK_MODEL_ID])(
    "sends one Converse command with the prompt, image, instruction and inference config for %s",
    async (modelId) => {
      mock.on(ConverseCommand).resolves(reply(JSON.stringify(VALID_VALUE)));
      const jpeg = makeJpeg();

      await adapterFor(modelId).classify(jpeg);

      expect(callCount()).toBe(1);
      const input = sentInput(0);
      // toStrictEqual pins the whole input: no extra keys, blocks or messages anywhere.
      expect(input).toStrictEqual({
        modelId,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [
          {
            role: "user",
            content: [
              { image: { format: "jpeg", source: { bytes: jpeg } } },
              { text: expect.stringMatching(/\S/) },
            ],
          },
        ],
        inferenceConfig: { temperature: 0, maxTokens: 200 },
      });
      // toStrictEqual compares bytes by value; the image must be the caller's own, unmodified instance.
      expect(userContent(input)[0]?.image?.source?.bytes).toBe(jpeg);
    },
  );

  it("sends commands that differ only in modelId for the primary and fallback models", async () => {
    mock.on(ConverseCommand).resolves(reply(JSON.stringify(VALID_VALUE)));
    const jpeg = makeJpeg();

    await adapterFor(PRIMARY_MODEL_ID).classify(jpeg);
    await adapterFor(FALLBACK_MODEL_ID).classify(jpeg);

    const primary = sentInput(0);
    const fallback = sentInput(1);
    expect(primary.modelId).toBe(PRIMARY_MODEL_ID);
    expect(fallback.modelId).toBe(FALLBACK_MODEL_ID);
    expect({ ...fallback, modelId: undefined }).toStrictEqual({ ...primary, modelId: undefined });
  });
});

describe("createBedrockVisionAdapter successful replies", () => {
  it("returns the four parsed fields from a plain valid reply after one call", async () => {
    mock.on(ConverseCommand).resolves(reply(JSON.stringify(VALID_VALUE)));

    const result = await adapterFor().classify(makeJpeg());

    // toStrictEqual fails on any key beyond the four, so this also proves exactly four fields.
    expect(result).toStrictEqual({ ok: true, value: VALID_VALUE });
    expect(callCount()).toBe(1);
  });

  it.each([
    { fence: "with a json tag", open: "```json\n", close: "\n```" },
    { fence: "without a tag", open: "```\n", close: "\n```" },
  ])("accepts a reply inside one markdown fence $fence after one call", async ({ open, close }) => {
    mock.on(ConverseCommand).resolves(reply(`${open}${JSON.stringify(VALID_VALUE)}${close}`));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: true, value: VALID_VALUE });
    expect(callCount()).toBe(1);
  });

  it("retries a reply with prose around the object and returns the valid retry", async () => {
    mock
      .on(ConverseCommand)
      .resolvesOnce(reply(`Here is my answer: ${JSON.stringify(VALID_VALUE)} Hope that helps.`))
      .resolves(reply(JSON.stringify(VALID_VALUE)));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: true, value: VALID_VALUE });
    expect(callCount()).toBe(2);
  });

  it("drops fields other than the four from a valid reply", async () => {
    const withExtras = { ...VALID_VALUE, model: "nova", details: { pipe: "main" } };
    mock.on(ConverseCommand).resolves(reply(JSON.stringify(withExtras)));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: true, value: VALID_VALUE });
  });

  it("cuts a reason longer than 120 characters to its first 120 characters", async () => {
    const longReason = "x".repeat(100) + "y".repeat(50);
    mock
      .on(ConverseCommand)
      .resolves(reply(JSON.stringify({ ...VALID_VALUE, reason: longReason })));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({
      ok: true,
      value: { ...VALID_VALUE, reason: longReason.slice(0, 120) },
    });
  });
});

describe("createBedrockVisionAdapter retry", () => {
  it("retries once with the extra instruction after an invalid reply and returns the valid retry", async () => {
    mock
      .on(ConverseCommand)
      .resolvesOnce(reply(JSON.stringify({ label: "major_leak" })))
      .resolves(reply(JSON.stringify(VALID_VALUE)));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: true, value: VALID_VALUE });
    expect(callCount()).toBe(2);
    const first = sentInput(0);
    const retry = sentInput(1);
    expect(userContent(retry)).toStrictEqual([...userContent(first), { text: RETRY_TEXT }]);
    expect({ ...retry, messages: undefined }).toStrictEqual({ ...first, messages: undefined });
  });

  it("returns unparseable_response after two invalid replies and sends no third command", async () => {
    mock.on(ConverseCommand).resolves(reply("I think this is a leak."));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: false, category: "unparseable_response" });
    expect(callCount()).toBe(2);
  });

  it("returns unparseable_response when both replies carry an unknown label", async () => {
    mock.on(ConverseCommand).resolves(reply(JSON.stringify({ ...VALID_VALUE, label: "flood" })));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: false, category: "unparseable_response" });
    expect(callCount()).toBe(2);
  });

  it.each([-0.1, 1.1])(
    "returns unparseable_response when both replies carry confidence %s outside 0-1",
    async (confidence) => {
      mock.on(ConverseCommand).resolves(reply(JSON.stringify({ ...VALID_VALUE, confidence })));

      const result = await adapterFor().classify(makeJpeg());

      expect(result).toStrictEqual({ ok: false, category: "unparseable_response" });
      expect(callCount()).toBe(2);
    },
  );
});

describe("createBedrockVisionAdapter thrown errors", () => {
  it.each([
    ["AccessDeniedException", "access_denied"],
    ["ValidationException", "model_invalid"],
    ["ResourceNotFoundException", "model_invalid"],
    ["ThrottlingException", "throttled"],
    ["ModelTimeoutException", "other"],
    ["ServiceUnavailableException", "other"],
  ])("maps %s on the first call to %s without a retry", async (name, category) => {
    mock.on(ConverseCommand).rejects(awsError(name));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({ ok: false, category, errorName: name });
    expect(Object.keys(result).sort()).toStrictEqual(["category", "errorName", "ok"]);
    expect(callCount()).toBe(1);
  });

  it("maps a ThrottlingException thrown on the retry to throttled after two calls", async () => {
    mock
      .on(ConverseCommand)
      .resolvesOnce(reply("not json"))
      .rejects(awsError("ThrottlingException"));

    const result = await adapterFor().classify(makeJpeg());

    expect(result).toStrictEqual({
      ok: false,
      category: "throttled",
      errorName: "ThrottlingException",
    });
    expect(callCount()).toBe(2);
  });

  it("resolves to other without an errorName when the client rejects with a non-Error value", async () => {
    // A rejected promise (not a sync throw) so aws-sdk-client-mock passes the string through unwrapped.
    mock.on(ConverseCommand).callsFake(() => Promise.reject("socket hang up"));

    const classified = adapterFor().classify(makeJpeg());

    await expect(classified).resolves.toStrictEqual({ ok: false, category: "other" });
    expect(callCount()).toBe(1);
  });
});

describe("parseVisionReply", () => {
  const roundTripCases: Array<{ name: string; value: VisionValue }> = [
    ...LABELS.map((label) => ({ name: `label ${label}`, value: { ...VALID_VALUE, label } })),
    ...COLOURS.map((waterColour) => ({
      name: `water colour ${waterColour}`,
      value: { ...VALID_VALUE, waterColour },
    })),
    { name: "confidence 0", value: { ...VALID_VALUE, confidence: 0 } },
    { name: "confidence 1", value: { ...VALID_VALUE, confidence: 1 } },
    {
      name: "a reason of exactly 120 characters",
      value: { ...VALID_VALUE, reason: "r".repeat(120) },
    },
  ];

  it.each(roundTripCases)("returns the serialised value unchanged for $name", ({ value }) => {
    expect(parseVisionReply(JSON.stringify(value))).toStrictEqual(value);
  });

  it.each(["", "[]", "null"])("returns null for the reply %j", (text) => {
    expect(parseVisionReply(text)).toBeNull();
  });
});

describe("buildConverseInput", () => {
  it("adds only the retry text block when building a retry input", () => {
    const jpeg = makeJpeg();

    const first = buildConverseInput(PRIMARY_MODEL_ID, jpeg, false);
    const retry = buildConverseInput(PRIMARY_MODEL_ID, jpeg, true);

    expect(userContent(retry)).toStrictEqual([...userContent(first), { text: RETRY_TEXT }]);
  });
});

describe("SYSTEM_PROMPT", () => {
  it.each(LABELS)("defines the label %s on its own line", (label) => {
    expect(SYSTEM_PROMPT).toMatch(new RegExp(`^- ${label}: \\S.*$`, "m"));
  });

  // Matched on the waterColour line only: "clear" also occurs inside "clearly" in a label definition.
  it.each(COLOURS)("lists the water colour %s on the waterColour line", (colour) => {
    expect(SYSTEM_PROMPT).toMatch(new RegExp(`^waterColour: one of .*\\b${colour}\\b`, "m"));
  });

  it.each([
    "confidence: a number in the range 0–1",
    "at most 120 characters",
    "exactly one JSON object and no other text",
  ])("states the rule %j", (rule) => {
    expect(SYSTEM_PROMPT).toContain(rule);
  });
});
