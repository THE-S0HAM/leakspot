// One summary per run for platform metrics (pk "STATS", sk "RUN#<createdAt>#<runId>"). Built from the
// run state by a pure function, so the API (after every successful run write) and the backfill script
// produce exactly the same item. Writing it again overwrites it: idempotent.

import type { RunState } from "@leakspot/core";

export type RunSummary = {
  runId: string;
  /** ISO time the run was created, or null when unknown (runs created before this was recorded). */
  createdAt: string | null;
  updatedAt: string;
  /** IST calendar date of createdAt (YYYY-MM-DD), or null. */
  istDate: string | null;
  clock: string;
  dayCompleted: boolean;
  incidents: {
    detected: number;
    byKind: { hidden: number; visible: number; cluster: number };
    dispatched: number;
    repaired: number;
    verified: number;
    closedLogged: number;
  };
  litresRecoveredPerDay: number;
  foundByMetersAlone: number;
  phoneReports: number;
  simulatedReports: number;
  /** AI photo checks (real photos sent to the vision model) by label. */
  aiChecks: Record<string, number>;
  /** priority score P of every incident */
  scores: number[];
  /** supply-time minutes from detection to verification, one per verified incident with stamps */
  minutesToVerify: number[];
  /** score components of each verified incident */
  verifiedProfiles: { W: number; E: number; C: number; K: number }[];
};

const LAST_SLOT = 19; // 19:45, the last slot of the day
const SLOTS_PER_DAY = 20;
const DISPATCHED = new Set([
  "dispatched",
  "onsite",
  "repaired",
  "verifying",
  "verified",
  "reopened",
  "closed_logged",
]);
const REPAIRED = new Set(["repaired", "verifying", "verified", "reopened", "closed_logged"]);
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The IST calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function istDateOf(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Milliseconds encoded in a ULID's first 10 characters, or undefined if it is not a ULID. */
export function ulidTime(id: string): number | undefined {
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return undefined;
  let ms = 0;
  for (const ch of id.slice(0, 10)) ms = ms * 32 + CROCKFORD.indexOf(ch);
  return ms;
}

/**
 * When the run started: the stored createdAt, else the time in the earliest phone report's ULID (an
 * upper bound, close enough for a daily chart), else null.
 */
export function runCreatedAt(state: RunState, storedCreatedAt?: string): string | null {
  if (storedCreatedAt) return storedCreatedAt;
  const times = state.reports
    .filter((r) => !r.scripted)
    .map((r) => ulidTime(r.id))
    .filter((t): t is number => t !== undefined);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function supplyMinutes(
  from: { day: number; slotIndex: number },
  to: { day: number; slotIndex: number },
): number {
  return ((to.day - from.day) * SLOTS_PER_DAY + (to.slotIndex - from.slotIndex)) * 15;
}

export function summarizeRun(
  runId: string,
  state: RunState,
  times: { createdAt?: string; updatedAt: string },
): RunSummary {
  const createdAt = runCreatedAt(state, times.createdAt);
  const byKind = { hidden: 0, visible: 0, cluster: 0 };
  let dispatched = 0;
  let repaired = 0;
  let verified = 0;
  let closedLogged = 0;
  let litres = 0;
  let metersAlone = 0;
  const minutesToVerify: number[] = [];
  const verifiedProfiles: RunSummary["verifiedProfiles"] = [];

  for (const inc of state.incidents) {
    byKind[inc.kind] += 1;
    if (inc.dispatchedAt || DISPATCHED.has(inc.status)) dispatched += 1;
    if (inc.repairedAt || REPAIRED.has(inc.status)) repaired += 1;
    if (inc.status === "closed_logged") closedLogged += 1;
    if (inc.verdict === "HIDDEN_SUSPECTED" || inc.verdict === "HIDDEN_AREA_KNOWN") metersAlone += 1;
    if (inc.status === "verified") {
      verified += 1;
      litres += inc.recoveredLitresPerDay ?? 0;
      const { W, E, C, K } = inc.score;
      verifiedProfiles.push({ W, E, C, K });
      if (inc.detectedAt && inc.verifiedAt) {
        minutesToVerify.push(Math.max(0, supplyMinutes(inc.detectedAt, inc.verifiedAt)));
      }
    }
  }

  const aiChecks: Record<string, number> = {};
  let phone = 0;
  let simulated = 0;
  for (const r of state.reports) {
    if (r.scripted) {
      simulated += 1;
      continue;
    }
    phone += 1;
    if (r.type === "leak_photo" && !r.selfReported && r.label) {
      aiChecks[r.label] = (aiChecks[r.label] ?? 0) + 1;
    }
  }

  return {
    runId,
    createdAt,
    updatedAt: times.updatedAt,
    istDate: createdAt ? istDateOf(createdAt) : null,
    clock: state.clockLabel,
    dayCompleted: state.clock.slotIndex >= LAST_SLOT,
    incidents: {
      detected: state.incidents.length,
      byKind,
      dispatched,
      repaired,
      verified,
      closedLogged,
    },
    litresRecoveredPerDay: Math.round(litres),
    foundByMetersAlone: metersAlone,
    phoneReports: phone,
    simulatedReports: simulated,
    aiChecks,
    scores: state.incidents.map((i) => i.score.P),
    minutesToVerify,
    verifiedProfiles,
  };
}

/** The summary item's sort key: chronological, with undated runs grouped first. */
export function summarySortKey(summary: Pick<RunSummary, "createdAt" | "runId">): string {
  return `RUN#${summary.createdAt ?? "0000-undated"}#${summary.runId}`;
}
