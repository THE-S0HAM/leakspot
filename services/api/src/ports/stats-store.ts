// StatsStore port: one summary item per run (pk "STATS") for platform metrics. DynamoDB adapter for
// AWS, in-memory adapter for local dev and tests. Writes overwrite (idempotent).
import type { RunSummary } from "../app/run-summary";

export interface StatsStore {
  /** Upsert this run's summary. */
  putRunSummary(summary: RunSummary): Promise<void>;
  /** Every summary, oldest sort key first, at most `limit` items. */
  listRunSummaries(limit: number): Promise<RunSummary[]>;
}
