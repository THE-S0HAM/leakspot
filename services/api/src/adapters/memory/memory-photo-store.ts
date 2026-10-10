// In-memory PhotoStore for local dev and tests. Returns a fake data: URL so the local flow has a URL
// to show without any S3 calls.

import type { PhotoStore } from "../../ports/photo-store";

export function createMemoryPhotoStore(): PhotoStore {
  const items = new Map<string, Uint8Array>();
  const key = (runId: string, reportId: string) => `photos/${runId}/${reportId}.jpg`;

  return {
    async put(runId, reportId, jpeg) {
      items.set(key(runId, reportId), jpeg);
    },
    async getBytes(runId, reportId) {
      return items.get(key(runId, reportId));
    },
    async presignedGetUrl(runId, reportId) {
      return items.has(key(runId, reportId)) ? `memory://${key(runId, reportId)}` : undefined;
    },
  };
}
