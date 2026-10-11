// Local dev API: the router over node:http on :8787 with in-memory adapters and FakeVision, so
// `npm run dev` (Vite) can proxy /api with no AWS. Not used in Lambda.

import { createServer, type IncomingMessage } from "node:http";
import { createFakeVision } from "../adapters/fake/fake-vision";
import { createMemoryPhotoStore } from "../adapters/memory/memory-photo-store";
import { createMemoryRunStore } from "../adapters/memory/memory-run-store";
import { route, stripApiPrefix, type RouterDeps } from "../http/router";

const PORT = Number(process.env["API_PORT"] ?? "8787");
const DEV_CODE_SHA256 = process.env["COMMAND_CODE_SHA256"] ?? "";
if (!/^[0-9a-f]{64}$/.test(DEV_CODE_SHA256)) {
  // Fail closed: without a valid hash every command route answers 401 (never open).
  console.warn(
    "[leakspot-api] COMMAND_CODE_SHA256 missing or invalid: all command routes will deny",
  );
}

const deps: RouterDeps = {
  runStore: createMemoryRunStore(),
  photoStore: createMemoryPhotoStore(),
  vision: createFakeVision(),
  commandCodeSha256: DEV_CODE_SHA256,
  appVersion: process.env["APP_VERSION"] ?? "dev",
  region: process.env["AWS_REGION"] ?? "ap-south-1",
  bedrockModel: process.env["BEDROCK_MODEL_ID"] ?? "global.amazon.nova-2-lite-v1:0",
  dailyCap: 300,
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const method = req.method ?? "GET";
    const path = stripApiPrefix((req.url ?? "/").split("?")[0] ?? "/");
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
    const body = method === "GET" ? undefined : await readBody(req);
    const result = await route({ method, path, headers, body }, deps);
    res.writeHead(result.status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(result.body));
  })();
});

server.listen(PORT, () => {
  console.warn(`[leakspot-api] local server on http://localhost:${PORT}`);
});
