// Tiny framework-free router shared by the Lambda handler and the local dev server.
// It takes a normalised request (method + path already stripped of the "/api" prefix)
// and returns a plain result the transport layers turn into their own response types.
// Deadline mode: the only route is GET /health; more routes are added as blocks need them.

export type RouterRequest = {
  method: string;
  /** Path with the leading "/api" removed, e.g. "/health". Always starts with "/". */
  path: string;
};

export type RouterResult = {
  status: number;
  /** JSON-serialisable body. */
  body: unknown;
};

const APP_VERSION = process.env["APP_VERSION"] ?? "dev";
const REGION = process.env["AWS_REGION"] ?? "ap-south-1";
const BEDROCK_MODEL = process.env["BEDROCK_MODEL_ID"] ?? "global.amazon.nova-2-lite-v1:0";

/** Remove a leading "/api" segment so routes are written without it. */
export function stripApiPrefix(rawPath: string): string {
  const withoutApi = rawPath === "/api" ? "/" : rawPath.replace(/^\/api(?=\/)/, "");
  const trimmed = withoutApi.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Route a normalised request. Pure: no I/O, so both transports and tests call it directly. */
export function route(req: RouterRequest): RouterResult {
  if (req.method === "GET" && req.path === "/health") {
    return {
      status: 200,
      body: { ok: true, version: APP_VERSION, region: REGION, bedrockModel: BEDROCK_MODEL },
    };
  }

  return {
    status: 404,
    body: { error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } },
  };
}
