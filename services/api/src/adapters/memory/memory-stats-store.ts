// In-memory StatsStore for local dev and tests, keyed like the DynamoDB item (sk) so overwrite and
// ordering behave the same.
import { summarySortKey, type RunSummary } from "../../app/run-summary";
import type { StatsStore } from "../../ports/stats-store";

export function createMemoryStatsStore(): StatsStore {
  const items = new Map<string, RunSummary>();
  return {
    async putRunSummary(summary) {
      items.set(summarySortKey(summary), structuredClone(summary));
    },
    async listRunSummaries(limit) {
      return [...items.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([, s]) => structuredClone(s));
    },
  };
}
