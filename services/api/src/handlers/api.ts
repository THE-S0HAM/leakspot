// Lambda entry point for the API, invoked through a buffered Function URL (payload format 2.0).
// It adapts the Function URL event to the pure router and formats the router result as an
// HTTP response. No AWS SDK here; keeping the handler thin keeps the router unit-testable.

import { route, stripApiPrefix, type RouterResult } from "../http/router";

// Minimal shape of the Function URL / API Gateway v2 request we rely on. We only read the
// method and raw path; declaring just these avoids a dependency on @types/aws-lambda.
type FunctionUrlEvent = {
  rawPath?: string;
  requestContext?: { http?: { method?: string } };
};

type FunctionUrlResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export async function handler(event: FunctionUrlEvent): Promise<FunctionUrlResponse> {
  const method = event.requestContext?.http?.method ?? "GET";
  const rawPath = event.rawPath ?? "/";
  const result = route({ method, path: stripApiPrefix(rawPath) });
  return toResponse(result);
}

function toResponse(result: RouterResult): FunctionUrlResponse {
  return {
    statusCode: result.status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(result.body),
  };
}
