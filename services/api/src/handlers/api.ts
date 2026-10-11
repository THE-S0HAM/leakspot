// Lambda entry point, invoked through a buffered Function URL (payload format 2.0). It builds the real
// AWS adapters once per cold start, adapts the Function URL event to the router, and formats the result.
// Config and adapters live at module scope so warm invocations reuse them.

import { loadConfig } from "../config";
import { createBedrockVisionAdapter } from "../adapters/bedrock/bedrock-vision-adapter";
import { createDynamoRunStore } from "../adapters/dynamo/dynamo-run-store";
import { createDynamoStatsStore } from "../adapters/dynamo/dynamo-stats-store";
import { createS3PhotoStore } from "../adapters/s3/s3-photo-store";
import { route, stripApiPrefix, type RouterDeps, type RouterResult } from "../http/router";

type FunctionUrlEvent = {
  rawPath?: string;
  rawQueryString?: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
};

type FunctionUrlResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const config = loadConfig();
const region = process.env["AWS_REGION"] ?? "ap-south-1";

const deps: RouterDeps = {
  runStore: createDynamoRunStore({ tableName: config.tableName }),
  statsStore: createDynamoStatsStore({ tableName: config.tableName }),
  photoStore: createS3PhotoStore({ bucket: config.photoBucket }),
  vision: createBedrockVisionAdapter({ modelId: config.bedrockModelId }),
  commandCodeSha256: config.commandCodeSha256,
  appVersion: config.appVersion,
  region,
  bedrockModel: config.bedrockModelId,
  dailyCap: config.bedrockDailyCap,
};

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  const method = event.requestContext?.http?.method ?? "GET";
  const path = stripApiPrefix(event.rawPath ?? "/");
  const headers = normaliseHeaders(event.headers ?? {});
  const body = parseBody(event);

  let result: RouterResult;
  try {
    result = await route({ method, path, headers, body }, deps);
  } catch {
    result = {
      status: 500,
      body: { error: { code: "INTERNAL", message: "Something went wrong" } },
    };
  }
  return toResponse(result);
}

function normaliseHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const lower: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) lower[key.toLowerCase()] = value;
  return lower;
}

function parseBody(event: FunctionUrlEvent): unknown {
  if (!event.body) return undefined;
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toResponse(result: RouterResult): FunctionUrlResponse {
  return {
    statusCode: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(result.body),
  };
}
