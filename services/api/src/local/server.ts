// Local dev API: the same router served over node:http on :8787 so `npm run dev` (Vite) can
// proxy /api to it. Nothing here runs in Lambda; it exists only for local development.

import { createServer } from "node:http";
import { route, stripApiPrefix } from "../http/router";

const PORT = Number(process.env["API_PORT"] ?? "8787");

const server = createServer((req, res) => {
  const method = req.method ?? "GET";
  const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
  const result = route({ method, path: stripApiPrefix(rawPath) });
  res.writeHead(result.status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, () => {
  // Allowed console method (no-console permits warn/error); a single startup line is useful locally.
  console.warn(`[leakspot-api] local server listening on http://localhost:${PORT}`);
});
