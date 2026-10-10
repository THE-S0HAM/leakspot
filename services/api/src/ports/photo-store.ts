// PhotoStore port: stores citizen photos privately and makes short-lived presigned GET URLs for command
// users. S3 adapter for AWS; in-memory adapter for local + tests. App layer depends only on this.

export interface PhotoStore {
  /** Store JPEG bytes at photos/{runId}/{reportId}.jpg. */
  put(runId: string, reportId: string, jpeg: Uint8Array): Promise<void>;
  /** Read stored JPEG bytes (for synchronous classification), or undefined if missing. */
  getBytes(runId: string, reportId: string): Promise<Uint8Array | undefined>;
  /** A presigned GET URL valid for ~5 minutes, or undefined if the object is missing. */
  presignedGetUrl(runId: string, reportId: string): Promise<string | undefined>;
}
