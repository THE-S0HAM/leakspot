// Framework-free async router shared by the Lambda handler and the local dev server. It owns the
// read → reduce → conditional-put → retry loop against the RunStore and maps domain outcomes to the
// JSON error envelope. Dependencies (stores, vision, config, id generators) are injected so the
// handler wires AWS adapters and tests/local wire in-memory ones.

import {
  AutopilotBody,
  CreateReportBody,
  TickBody,
  AuthCheckBody,
  type Stage,
} from "@leakspot/contracts";
import {
  addReport,
  createRun,
  dispatch,
  DomainConflict,
  getContext,
  repair,
  setAutopilot,
  tickMany,
  type Incident,
  type ReportInput,
  type RunState,
} from "@leakspot/core";
import type { VisionPort } from "../ports/vision";
import type { RunStore } from "../ports/run-store";
import { VersionConflictError } from "../ports/run-store";
import type { PhotoStore } from "../ports/photo-store";
import { codeMatches } from "../app/auth";
import { checkJpegBase64 } from "../app/jpeg";
import { allowReport, clientKey } from "../app/rate-limit";
import { newReportId, newRunId, ticketCode } from "../app/ids";
import { resolveVision } from "../app/classify";

export type RouterDeps = {
  runStore: RunStore;
  photoStore: PhotoStore;
  vision: VisionPort;
  commandCodeSha256: string;
  appVersion: string;
  region: string;
  bedrockModel: string;
  dailyCap: number;
  newRunId?: () => string;
  newReportId?: () => string;
};

export type RouterRequest = {
  method: string;
  path: string; // already stripped of /api
  headers: Record<string, string | undefined>;
  body: unknown; // parsed JSON (or undefined)
};

export type RouterResult = { status: number; body: unknown };

const MAX_PUT_RETRIES = 3;

export function stripApiPrefix(rawPath: string): string {
  const withoutApi = rawPath === "/api" ? "/" : rawPath.replace(/^\/api(?=\/)/, "");
  const trimmed = withoutApi.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function err(
  status: number,
  code: string,
  message: string,
  retryAfterSeconds?: number,
): RouterResult {
  return {
    status,
    body: { error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } },
  };
}

const NOT_FOUND = err(404, "NOT_FOUND", "No such route");

function requireCommand(req: RouterRequest, deps: RouterDeps): RouterResult | undefined {
  if (!codeMatches(req.headers["x-leakspot-code"], deps.commandCodeSha256)) {
    return err(401, "UNAUTHORIZED", "A valid command code is required");
  }
  return undefined;
}

/** Public view of a run. */
function publicView(runId: string, state: RunState): unknown {
  return {
    runId,
    isShowcase: runId === "SHOWCASE",
    simClock: { day: state.clock.day, slotIndex: state.clock.slotIndex, label: state.clockLabel },
    cityHealth: state.cityHealth,
    sectors: state.sectors.map((s) => ({ id: s.id, status: s.status })),
  };
}

function incidentView(incident: Incident): unknown {
  return {
    id: incident.id,
    kind: incident.kind,
    sectorId: incident.sectorId,
    status: incident.status,
    verdict: incident.verdict,
    pin: incident.pin,
    score: incident.score,
    why: incident.why,
  };
}

function fullState(runId: string, state: RunState): unknown {
  return {
    seed: state.seed,
    cycle: state.cycle,
    simClock: { day: state.clock.day, slotIndex: state.clock.slotIndex, label: state.clockLabel },
    supplyOn: state.supplyOn,
    autopilot: state.autopilot,
    crew: state.crew,
    cityHealth: state.cityHealth,
    waterRecoveredLitres: state.waterRecoveredLitres,
    sectors: state.sectors,
    incidents: state.incidents.map(incidentView),
    recentEvents: state.recentEvents,
    recentReports: recentReportsView(runId, state),
  };
}

/** The last 12 reports as map pins (derived per request; not stored on the aggregate). */
function recentReportsView(runId: string, state: RunState): unknown[] {
  return state.reports
    .filter((r) => r.position)
    .slice(-12)
    .map((r) => {
      const incident = r.incidentId
        ? state.incidents.find((i) => i.id === r.incidentId)
        : undefined;
      const status = r.rejected ? "rejected" : (incident?.status ?? "pending");
      return {
        code: ticketCode(runId, r.id),
        reportId: r.id,
        x: r.position?.x ?? 0,
        z: r.position?.z ?? 0,
        sectorId: r.sectorId,
        type: r.type,
        label: r.label ?? null,
        confidence: r.confidence ?? null,
        status,
        simTime: r.simTime ?? null,
        source: r.scripted ? "simulated" : "phone",
      };
    });
}

function reportView(runId: string, state: RunState, reportId: string): RouterResult {
  const record = state.reports.find((r) => r.id === reportId);
  const pending = state.pendingReports.find((p) => p.id === reportId);
  if (!record && !pending) return err(404, "NOT_FOUND", "No such report");
  const incident = record?.incidentId
    ? state.incidents.find((i) => i.id === record.incidentId)
    : undefined;
  // How many OTHER reports share this incident (for "added to an existing report · N neighbours").
  const mergedCount = record?.incidentId
    ? state.reports.filter((r) => r.incidentId === record.incidentId && r.id !== reportId).length
    : 0;
  return {
    status: 200,
    body: {
      reportId,
      ticketCode: ticketCode(runId, reportId),
      type: record?.type ?? pending?.type,
      sectorId: record?.sectorId,
      rejected: record?.rejected ?? false,
      selfReported: record?.selfReported ?? false,
      label: record?.label,
      status: pending ? "pending" : "done",
      mergedCount,
      stages: record ? stagesFor(record.rejected, record.selfReported) : pendingStages(),
      incident: incident
        ? { id: incident.id, status: incident.status, verdict: incident.verdict }
        : undefined,
    },
  };
}

function pendingStages(): Stage[] {
  const now = new Date().toISOString();
  return [
    { stage: "received", at: now },
    { stage: "located", at: now },
  ];
}

/** Build the pipeline stage list for a report's current outcome (truthful, no fake timing). */
function stagesFor(rejected: boolean, selfReported: boolean): Stage[] {
  const now = new Date().toISOString();
  const line = (stage: Stage["stage"], detail?: string): Stage => ({
    stage,
    at: now,
    ...(detail ? { detail } : {}),
  });
  if (rejected) {
    return [line("received"), line("located"), line("classifying"), line("rejected")];
  }
  const source = selfReported ? "self" : "bedrock";
  return [
    line("received"),
    line("located"),
    line("classifying"),
    line("classified", source),
    line("matching"),
    line("matched"),
    line("scored"),
    line("done"),
  ];
}

/** Load → reduce → conditional put, retrying up to 3× on a version conflict; else BUSY. */
async function mutate(
  deps: RouterDeps,
  runId: string,
  reduce: (state: RunState) => RunState,
): Promise<{ state: RunState } | RouterResult> {
  for (let attempt = 0; attempt < MAX_PUT_RETRIES; attempt += 1) {
    const stored = await deps.runStore.get(runId);
    if (!stored) return err(404, "NOT_FOUND", "No such run");
    const next = reduce(stored.state);
    try {
      const saved = await deps.runStore.put(runId, next, stored.version);
      return { state: saved.state };
    } catch (error) {
      if (error instanceof VersionConflictError) continue;
      throw error;
    }
  }
  return err(503, "BUSY", "The run is busy, retry shortly", 1);
}

export async function route(req: RouterRequest, deps: RouterDeps): Promise<RouterResult> {
  // Path params (e.g. incident id "#1" sent as "%231") must be decoded before matching. A malformed
  // percent-escape is a bad request, not a server error.
  let segments: string[];
  try {
    segments = req.path
      .split("/")
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
  } catch {
    return err(400, "VALIDATION", "The request path is malformed");
  }
  const { method } = req;

  // GET /health
  if (method === "GET" && req.path === "/health") {
    return {
      status: 200,
      body: {
        ok: true,
        version: deps.appVersion,
        region: deps.region,
        bedrockModel: deps.bedrockModel,
      },
    };
  }

  // POST /auth/check
  if (method === "POST" && req.path === "/auth/check") {
    const parsed = AuthCheckBody.safeParse(req.body);
    if (!parsed.success) return err(400, "VALIDATION", "A code is required");
    if (!codeMatches(parsed.data.code, deps.commandCodeSha256)) {
      return err(401, "UNAUTHORIZED", "That code was not recognised");
    }
    return { status: 200, body: { ok: true } };
  }

  // POST /runs  (command)
  if (method === "POST" && req.path === "/runs") {
    const unauthorized = requireCommand(req, deps);
    if (unauthorized) return unauthorized;
    const runId = (deps.newRunId ?? newRunId)();
    const { state } = createRun(42);
    await deps.runStore.create(runId, state);
    return { status: 200, body: { runId } };
  }

  // /runs/{id}/...
  if (segments[0] === "runs" && segments[1]) {
    return routeRun(req, deps, segments.slice(1));
  }

  return NOT_FOUND;
}

async function routeRun(
  req: RouterRequest,
  deps: RouterDeps,
  rest: string[],
): Promise<RouterResult> {
  const [runId, resource, ...tail] = rest as [string, ...string[]];
  const { method } = req;

  // GET /runs/{id}/public  (public)
  if (method === "GET" && resource === "public") {
    const stored = await deps.runStore.get(runId);
    if (!stored) return err(404, "NOT_FOUND", "No such run");
    return { status: 200, body: publicView(runId, stored.state) };
  }

  // GET /runs/{id}/state  (command)
  if (method === "GET" && resource === "state") {
    const unauthorized = requireCommand(req, deps);
    if (unauthorized) return unauthorized;
    const stored = await deps.runStore.get(runId);
    if (!stored) return err(404, "NOT_FOUND", "No such run");
    return { status: 200, body: { runId, ...(fullState(runId, stored.state) as object) } };
  }

  // POST /runs/{id}/tick  (command)
  if (method === "POST" && resource === "tick") {
    const unauthorized = requireCommand(req, deps);
    if (unauthorized) return unauthorized;
    const parsed = TickBody.safeParse(req.body ?? { count: 1 });
    if (!parsed.success) return err(400, "VALIDATION", "count must be an integer 1–4");
    const context = getContext(42);
    try {
      const result = await mutate(
        deps,
        runId,
        (state) => tickMany(state, context, parsed.data.count).state,
      );
      return "state" in result
        ? { status: 200, body: { runId, ...(fullState(runId, result.state) as object) } }
        : result;
    } catch (error) {
      if (error instanceof DomainConflict) return err(409, "CONFLICT", error.message);
      throw error;
    }
  }

  // POST /runs/{id}/autopilot  (command)
  if (method === "POST" && resource === "autopilot") {
    const unauthorized = requireCommand(req, deps);
    if (unauthorized) return unauthorized;
    const parsed = AutopilotBody.safeParse(req.body);
    if (!parsed.success) return err(400, "VALIDATION", "on must be a boolean");
    const result = await mutate(deps, runId, (state) => setAutopilot(state, parsed.data.on).state);
    return "state" in result
      ? { status: 200, body: { runId, ...(fullState(runId, result.state) as object) } }
      : result;
  }

  // /runs/{id}/incidents/{iid}/dispatch|repair  (command)
  if (resource === "incidents" && tail[0] && tail[1]) {
    return routeIncidentAction(req, deps, runId, tail[0], tail[1]);
  }

  // /runs/{id}/reports...
  if (resource === "reports") {
    return routeReports(req, deps, runId, tail);
  }

  return NOT_FOUND;
}

async function routeIncidentAction(
  req: RouterRequest,
  deps: RouterDeps,
  runId: string,
  incidentId: string,
  action: string,
): Promise<RouterResult> {
  const unauthorized = requireCommand(req, deps);
  if (unauthorized) return unauthorized;
  if (req.method !== "POST") return NOT_FOUND;

  const context = getContext(42);
  try {
    const result = await mutate(deps, runId, (state) =>
      action === "dispatch"
        ? dispatch(state, incidentId).state
        : action === "repair"
          ? repair(state, context, incidentId).state
          : state,
    );
    if (action !== "dispatch" && action !== "repair") return NOT_FOUND;
    return "state" in result
      ? { status: 200, body: { runId, ...(fullState(runId, result.state) as object) } }
      : result;
  } catch (error) {
    if (error instanceof DomainConflict) {
      return err(409, "CONFLICT", error.message, error.message.includes("07:00") ? undefined : 2);
    }
    throw error;
  }
}

async function routeReports(
  req: RouterRequest,
  deps: RouterDeps,
  runId: string,
  tail: string[],
): Promise<RouterResult> {
  const { method } = req;

  // POST /runs/{id}/reports  (public) — create, store photo, return reportId + stages
  if (method === "POST" && tail.length === 0) {
    return createReport(req, deps, runId);
  }

  const reportId = tail[0];
  if (!reportId) return NOT_FOUND;

  // POST /runs/{id}/reports/{rid}/classify  (public) — Bedrock + addReport
  if (method === "POST" && tail[1] === "classify") {
    return classifyReport(deps, runId, reportId);
  }

  // GET /runs/{id}/reports/{rid}/photo  (command) — presigned URL
  if (method === "GET" && tail[1] === "photo") {
    const unauthorized = requireCommand(req, deps);
    if (unauthorized) return unauthorized;
    const url = await deps.photoStore.presignedGetUrl(runId, reportId);
    if (!url) return err(404, "NOT_FOUND", "No photo for that report");
    return { status: 200, body: { url } };
  }

  // GET /runs/{id}/reports/{rid}  (public) — ticket
  if (method === "GET" && tail.length === 1) {
    const stored = await deps.runStore.get(runId);
    if (!stored) return err(404, "NOT_FOUND", "No such run");
    return reportView(runId, stored.state, reportId);
  }

  return NOT_FOUND;
}

async function createReport(
  req: RouterRequest,
  deps: RouterDeps,
  runId: string,
): Promise<RouterResult> {
  // Rate limit citizen report creation (20 per 10 min per client). Command endpoints are never limited.
  const rate = allowReport(clientKey(req.headers));
  if (!rate.allowed) {
    return err(
      429,
      "RATE_LIMITED",
      `Too many reports from this phone. Try again in ${Math.ceil(rate.retryAfterSeconds / 60)} minutes.`,
      rate.retryAfterSeconds,
    );
  }
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    return err(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid report");
  }
  const body = parsed.data;

  // Validate + store the photo (if any) before touching the run item.
  let photoBytes: Uint8Array | undefined;
  if (body.type === "leak_photo") {
    const check = checkJpegBase64(body.photoJpegBase64 ?? "");
    if (!check.ok) {
      return check.reason === "too_large"
        ? err(413, "PAYLOAD_TOO_LARGE", "That photo is over 400 KB. Retake it or move closer.")
        : err(400, "VALIDATION", "That file is not a JPEG photo.");
    }
    photoBytes = check.bytes;
  }

  const reportId = (deps.newReportId ?? newReportId)();
  if (photoBytes) await deps.photoStore.put(runId, reportId, photoBytes);

  // Record the pending report in RunState so classify (a separate request) can fuse it statelessly.
  const result = await mutate(deps, runId, (state) => ({
    ...state,
    pendingReports: [
      ...state.pendingReports,
      { id: reportId, type: body.type, x: body.x, z: body.z, selfChoice: body.selfChoice },
    ],
  }));
  if (!("state" in result)) return result;

  const now = new Date().toISOString();
  const stages: Stage[] = [
    { stage: "received", at: now },
    ...(photoBytes
      ? [{ stage: "stored" as const, at: now, detail: `${photoBytes.length} bytes` }]
      : []),
    { stage: "located", at: now },
  ];
  return { status: 202, body: { reportId, ticketCode: ticketCode(runId, reportId), stages } };
}

async function classifyReport(
  deps: RouterDeps,
  runId: string,
  reportId: string,
): Promise<RouterResult> {
  const stored = await deps.runStore.get(runId);
  if (!stored) return err(404, "NOT_FOUND", "No such run");
  const pending = stored.state.pendingReports.find((p) => p.id === reportId);
  if (!pending) {
    // Already classified? Return the existing report view rather than an error (idempotent).
    const existing = stored.state.reports.find((r) => r.id === reportId);
    if (existing) return reportView(runId, stored.state, reportId);
    return err(404, "NOT_FOUND", "No report awaiting classification");
  }

  let input: ReportInput;
  let label = "self_reported";
  let confidence = 0;
  let fallbackReason: string | undefined;

  if (pending.type === "leak_photo") {
    const selfChoice = pending.selfChoice === "dripping" ? "dripping" : "flowing";
    const bytes = (await deps.photoStore.getBytes(runId, reportId)) ?? new Uint8Array();
    const resolved = await resolveVision(deps.vision, bytes, selfChoice);
    input = {
      id: reportId,
      type: "leak_photo",
      position: { x: pending.x, z: pending.z },
      label: resolved.engineLabel,
      confidence: resolved.confidence,
      selfReported: resolved.selfReported,
      selfChoice,
    };
    label = resolved.label;
    confidence = resolved.confidence;
    fallbackReason = resolved.fallbackReason;
  } else {
    input = {
      id: reportId,
      type: "low_water",
      position: { x: pending.x, z: pending.z },
      selfChoice: pending.selfChoice,
    };
  }

  const result = await mutate(deps, runId, (state) => {
    const fused = addReport(state, input).state;
    return { ...fused, pendingReports: fused.pendingReports.filter((p) => p.id !== reportId) };
  });
  if (!("state" in result)) return result;

  const record = result.state.reports.find((r) => r.id === reportId);
  const incident = record?.incidentId
    ? result.state.incidents.find((i) => i.id === record.incidentId)
    : undefined;
  // Other reports already on this incident, so the citizen Result card reads "4 reports" / "N neighbours".
  const mergedCount = incident
    ? result.state.reports.filter((r) => r.incidentId === incident.id && r.id !== reportId).length
    : 0;

  return {
    status: 200,
    body: {
      reportId,
      label,
      confidence,
      ...(fallbackReason ? { fallbackReason } : {}),
      rejected: record?.rejected ?? false,
      mergedCount,
      stages: stagesFor(record?.rejected ?? false, record?.selfReported ?? false),
      incident: incident
        ? {
            id: incident.id,
            status: incident.status,
            verdict: incident.verdict,
            sectorId: incident.sectorId,
            priority: incident.score.P,
          }
        : undefined,
    },
  };
}
