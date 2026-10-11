// GET /api/stats: platform metrics aggregated over every run's summary item. Public and read-only.
// The web landing page (KPI strip, three charts) and the /metrics page render this shape.
import { z } from "zod";

const count = z.number().int().nonnegative();
const amount = z.number().nonnegative();

export const StatsTotals = z.object({
  runs: count,
  daysCompleted: count,
  incidentsDetected: count,
  detectedByKind: z.object({ hidden: count, visible: count, cluster: count }),
  dispatched: count,
  repaired: count,
  verified: count,
  closedLogged: count,
  litresRecoveredPerDay: amount,
  foundByMetersAlone: count,
  phoneReports: count,
  simulatedReports: count,
  aiPhotoChecks: count,
});
export type StatsTotals = z.infer<typeof StatsTotals>;

/** One IST calendar day. Days with no runs are present with zeros so charts have a continuous axis. */
export const StatsDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runs: count,
  detected: count,
  verified: count,
  litresRecoveredPerDay: amount,
  phoneReports: count,
  simulatedReports: count,
  aiPhotoChecks: count,
});
export type StatsDay = z.infer<typeof StatsDay>;

export const StatsBin = z.object({ from: z.number(), to: z.number(), count });
export type StatsBin = z.infer<typeof StatsBin>;

export const StatsRecentRun = z.object({
  runId: z.string(),
  createdAt: z.string().nullable(),
  clock: z.string(),
  dayCompleted: z.boolean(),
  detected: count,
  verified: count,
  litresRecoveredPerDay: amount,
  phoneReports: count,
});
export type StatsRecentRun = z.infer<typeof StatsRecentRun>;

export const StatsResponse = z.object({
  generatedAt: z.string(),
  totals: StatsTotals,
  /** the last 30 IST days, oldest first */
  daily: z.array(StatsDay),
  /** priority scores of all incidents in bins of 10 (0–9 … 90–100) */
  scoreHistogram: z.array(StatsBin),
  /** supply-time minutes from detection to verification, in 15-minute bins */
  verifyHistogram: z.array(StatsBin),
  /** average score components (0–1) of verified incidents; n = how many */
  scoreProfile: z.object({ W: amount, E: amount, C: amount, K: amount, n: count }),
  /** AI photo checks per label, most frequent first */
  aiLabels: z.array(z.object({ label: z.string(), count })),
  funnel: z.object({ detected: count, dispatched: count, repaired: count, verified: count }),
  recentRuns: z.array(StatsRecentRun),
});
export type StatsResponse = z.infer<typeof StatsResponse>;
