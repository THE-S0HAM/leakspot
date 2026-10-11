// In-memory RunStore for local dev and tests. Mirrors the DynamoDB adapter's version semantics so the
// same router logic (read → reduce → conditional put → retry) exercises the same conflict path locally.

import { VersionConflictError, type RunStore, type StoredRun } from "../../ports/run-store";

export function createMemoryRunStore(): RunStore {
  const items = new Map<string, StoredRun>();

  return {
    async get(runId) {
      const found = items.get(runId);
      return found ? { ...found, state: structuredClone(found.state) } : undefined;
    },
    async create(runId, state, now = new Date().toISOString()) {
      if (items.has(runId)) throw new VersionConflictError(`run ${runId} already exists`);
      const stored: StoredRun = {
        state: structuredClone(state),
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      items.set(runId, stored);
      return { ...stored, state: structuredClone(stored.state) };
    },
    async put(runId, state, expectedVersion, createdAt, now = new Date().toISOString()) {
      const current = items.get(runId);
      if (!current || current.version !== expectedVersion) {
        throw new VersionConflictError(`version conflict on ${runId}`);
      }
      const stored: StoredRun = {
        state: structuredClone(state),
        version: expectedVersion + 1,
        createdAt,
        updatedAt: now,
      };
      items.set(runId, stored);
      return { ...stored, state: structuredClone(stored.state) };
    },
  };
}
