// Minimal in-memory sliding-window rate limiter for citizen report creation only. Deadline mode cut
// the DynamoDB atomic limiter, so this is a per-Lambda-instance guard: it caps obvious floods from one
// client without any storage. Command endpoints are never limited (so Play at 4× can't be throttled).
// The client key is derived from the CloudFront viewer address header; unknown → a shared "anon" bucket.

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPORTS = 20; // 20 citizen reports per window per client

const hits = new Map<string, number[]>();

/** Client key from the CloudFront viewer-address header (ip:port) or a shared fallback. */
export function clientKey(headers: Record<string, string | undefined>): string {
  const addr = headers["cloudfront-viewer-address"] ?? headers["x-forwarded-for"];
  if (!addr) return "anon";
  // Keep only the IP part (strip the port) so the window follows the device, not the ephemeral port.
  const ip = addr.includes(":") ? addr.slice(0, addr.lastIndexOf(":")) : addr;
  return ip || "anon";
}

export type RateResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Record a report attempt for `key`; allow up to 20 per rolling 10 minutes. */
export function allowReport(key: string, now = Date.now()): RateResult {
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= MAX_REPORTS) {
    const oldest = recent[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}

/** Test-only: clear all windows. */
export function __resetRateLimitForTests(): void {
  hits.clear();
}

export const RATE_LIMITS = {
  citizenReportsPerWindow: MAX_REPORTS,
  windowMinutes: WINDOW_MS / 60000,
} as const;
