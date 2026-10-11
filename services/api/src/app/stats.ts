// Aggregates run summaries into the GET /api/stats response. Pure: the router passes the summaries it
// queried and the current time. One run can have left more than one summary item (if its sort key
// changed), so summaries are de-duplicated by runId, keeping the most recently updated.

import type { StatsBin, StatsResponse } from "@leakspot/contracts";
import type { RunSummary } from "./run-summary";
import { istDateOf } from "./run-summary";

const DAYS = 30;
const RECENT = 10;

function latestPerRun(summaries: readonly RunSummary[]): RunSummary[] {
  const byRun = new Map<string, RunSummary>();
  for (const s of summaries) {
    const prev = byRun.get(s.runId);
    if (!prev || s.updatedAt > prev.updatedAt) byRun.set(s.runId, s);
  }
  return [...byRun.values()];
}

function lastDays(now: Date): string[] {
  const today = istDateOf(now.toISOString());
  const base = Date.parse(`${today}T00:00:00Z`);
  return [...Array(DAYS).keys()].map((i) =>
    new Date(base - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

function bins(values: readonly number[], width: number, min: number, max: number): StatsBin[] {
  const out: StatsBin[] = [];
  for (let from = min; from < max; from += width) out.push({ from, to: from + width, count: 0 });
  for (const v of values) {
    const i = Math.min(out.length - 1, Math.max(0, Math.floor((v - min) / width)));
    const bin = out[i];
    if (bin) bin.count += 1;
  }
  return out;
}

export function aggregateStats(summaries: readonly RunSummary[], now: Date): StatsResponse {
  const runs = latestPerRun(summaries);
  const totals: StatsResponse["totals"] = {
    runs: runs.length,
    daysCompleted: 0,
    incidentsDetected: 0,
    detectedByKind: { hidden: 0, visible: 0, cluster: 0 },
    dispatched: 0,
    repaired: 0,
    verified: 0,
    closedLogged: 0,
    litresRecoveredPerDay: 0,
    foundByMetersAlone: 0,
    phoneReports: 0,
    simulatedReports: 0,
    aiPhotoChecks: 0,
  };
  const labels = new Map<string, number>();
  const scores: number[] = [];
  const minutes: number[] = [];
  const profile = { W: 0, E: 0, C: 0, K: 0, n: 0 };
  const days = lastDays(now);
  const daily = new Map(
    days.map((date) => [
      date,
      {
        date,
        runs: 0,
        detected: 0,
        verified: 0,
        litresRecoveredPerDay: 0,
        phoneReports: 0,
        simulatedReports: 0,
        aiPhotoChecks: 0,
      },
    ]),
  );

  for (const r of runs) {
    const ai = Object.values(r.aiChecks).reduce((a, b) => a + b, 0);
    totals.daysCompleted += r.dayCompleted ? 1 : 0;
    totals.incidentsDetected += r.incidents.detected;
    totals.detectedByKind.hidden += r.incidents.byKind.hidden;
    totals.detectedByKind.visible += r.incidents.byKind.visible;
    totals.detectedByKind.cluster += r.incidents.byKind.cluster;
    totals.dispatched += r.incidents.dispatched;
    totals.repaired += r.incidents.repaired;
    totals.verified += r.incidents.verified;
    totals.closedLogged += r.incidents.closedLogged;
    totals.litresRecoveredPerDay += r.litresRecoveredPerDay;
    totals.foundByMetersAlone += r.foundByMetersAlone;
    totals.phoneReports += r.phoneReports;
    totals.simulatedReports += r.simulatedReports;
    totals.aiPhotoChecks += ai;
    for (const [label, n] of Object.entries(r.aiChecks))
      labels.set(label, (labels.get(label) ?? 0) + n);
    scores.push(...r.scores);
    minutes.push(...r.minutesToVerify);
    for (const p of r.verifiedProfiles) {
      profile.W += p.W;
      profile.E += p.E;
      profile.C += p.C;
      profile.K += p.K;
      profile.n += 1;
    }
    const day = r.istDate ? daily.get(r.istDate) : undefined;
    if (day) {
      day.runs += 1;
      day.detected += r.incidents.detected;
      day.verified += r.incidents.verified;
      day.litresRecoveredPerDay += r.litresRecoveredPerDay;
      day.phoneReports += r.phoneReports;
      day.simulatedReports += r.simulatedReports;
      day.aiPhotoChecks += ai;
    }
  }

  const n = profile.n || 1;
  const maxMinutes = Math.max(60, Math.ceil(Math.max(0, ...minutes) / 15) * 15 + 15);
  const recentRuns = [...runs]
    .sort((a, b) => (b.createdAt ?? b.updatedAt).localeCompare(a.createdAt ?? a.updatedAt))
    .slice(0, RECENT)
    .map((r) => ({
      runId: r.runId,
      createdAt: r.createdAt,
      clock: r.clock,
      dayCompleted: r.dayCompleted,
      detected: r.incidents.detected,
      verified: r.incidents.verified,
      litresRecoveredPerDay: r.litresRecoveredPerDay,
      phoneReports: r.phoneReports,
    }));

  return {
    generatedAt: now.toISOString(),
    totals,
    daily: days.map((d) => daily.get(d)).filter((d) => d !== undefined),
    scoreHistogram: bins(scores, 10, 0, 100),
    verifyHistogram: bins(minutes, 15, 0, maxMinutes),
    scoreProfile: {
      W: profile.W / n,
      E: profile.E / n,
      C: profile.C / n,
      K: profile.K / n,
      n: profile.n,
    },
    aiLabels: [...labels.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    funnel: {
      detected: totals.incidentsDetected,
      dispatched: totals.dispatched,
      repaired: totals.repaired,
      verified: totals.verified,
    },
    recentRuns,
  };
}
