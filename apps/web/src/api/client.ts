// Typed API client over fetch. Same-origin: all paths are under /api (CloudFront routes /api/* to the
// Lambda; Vite proxies it in dev). Command routes send the access code in x-leakspot-code. Throws
// ApiCallError with the envelope's code/message on a non-2xx response.

import type {
  ClassifyResponse,
  CreateReportResponse,
  PublicStateView,
  RunStateView,
  TicketView,
} from "./types";

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

async function call<T>(
  method: string,
  path: string,
  opts: { code?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.code) headers["x-leakspot-code"] = opts.code;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const envelope = parsed as {
      error?: { code?: string; message?: string; retryAfterSeconds?: number };
    };
    throw new ApiCallError(
      res.status,
      envelope?.error?.code ?? "INTERNAL",
      envelope?.error?.message ?? `Request failed (${res.status})`,
      envelope?.error?.retryAfterSeconds,
    );
  }
  return parsed as T;
}

// ---- public ----
export function getPublicState(runId: string): Promise<PublicStateView> {
  return call("GET", `/runs/${runId}/public`);
}

export function createReport(
  runId: string,
  body: {
    type: "leak_photo" | "low_water";
    x: number;
    z: number;
    lang: "en" | "hi" | "mr";
    selfChoice?: string;
    photoJpegBase64?: string;
  },
): Promise<CreateReportResponse> {
  return call("POST", `/runs/${runId}/reports`, { body });
}

export function classifyReport(runId: string, reportId: string): Promise<ClassifyResponse> {
  return call("POST", `/runs/${runId}/reports/${reportId}/classify`);
}

export function getTicket(runId: string, reportId: string): Promise<TicketView> {
  return call("GET", `/runs/${runId}/reports/${reportId}`);
}

// ---- command (require the access code) ----
export function checkCode(code: string): Promise<{ ok: boolean }> {
  return call("POST", `/auth/check`, { body: { code } });
}

export function createRun(code: string): Promise<{ runId: string }> {
  return call("POST", `/runs`, { code });
}

export function getState(runId: string, code: string): Promise<RunStateView> {
  return call("GET", `/runs/${runId}/state`, { code });
}

export function tickRun(runId: string, code: string, count = 1): Promise<RunStateView> {
  return call("POST", `/runs/${runId}/tick`, { code, body: { count } });
}

export function setAutopilot(runId: string, code: string, on: boolean): Promise<RunStateView> {
  return call("POST", `/runs/${runId}/autopilot`, { code, body: { on } });
}

export function dispatchCrew(
  runId: string,
  code: string,
  incidentId: string,
): Promise<RunStateView> {
  return call("POST", `/runs/${runId}/incidents/${encodeURIComponent(incidentId)}/dispatch`, {
    code,
  });
}

export function repairIncident(
  runId: string,
  code: string,
  incidentId: string,
): Promise<RunStateView> {
  return call("POST", `/runs/${runId}/incidents/${encodeURIComponent(incidentId)}/repair`, {
    code,
  });
}
