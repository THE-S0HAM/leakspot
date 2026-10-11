// RunStore port: persistence for the run aggregate (one item per run). The DynamoDB adapter implements
// optimistic locking via the version check; the in-memory adapter mirrors it for local + tests. The app
// layer depends only on this interface, never on @aws-sdk/* (dependency rules).

import type { RunState } from "@leakspot/core";

/** Thrown when a conditional put fails because the stored version moved under us. */
export class VersionConflictError extends Error {
  readonly code = "CONFLICT";
}

export type StoredRun = {
  state: RunState;
  version: number;
  /** ISO times kept on the item (not in RunState); absent on runs created before they were recorded. */
  createdAt?: string;
  updatedAt?: string;
};

export interface RunStore {
  /** Load a run, or undefined if it does not exist. */
  get(runId: string): Promise<StoredRun | undefined>;
  /** Create a run item; rejects (CONFLICT) if one already exists at runId. */
  create(runId: string, state: RunState, now?: string): Promise<StoredRun>;
  /** Conditional put: write only if the stored version equals expectedVersion, else VersionConflictError. */
  put(
    runId: string,
    state: RunState,
    expectedVersion: number,
    createdAt?: string,
    now?: string,
  ): Promise<StoredRun>;
}
