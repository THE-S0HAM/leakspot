import { afterEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, allowReport, clientKey, RATE_LIMITS } from "./rate-limit";

afterEach(() => __resetRateLimitForTests());

describe("allowReport", () => {
  it("allows 20 reports then blocks the 21st with a retry time", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < RATE_LIMITS.citizenReportsPerWindow; i += 1) {
      expect(allowReport(key).allowed).toBe(true);
    }
    const blocked = allowReport(key);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks clients independently", () => {
    for (let i = 0; i < RATE_LIMITS.citizenReportsPerWindow; i += 1) allowReport("a");
    expect(allowReport("a").allowed).toBe(false);
    expect(allowReport("b").allowed).toBe(true);
  });

  it("frees the window after it rolls past (10 minutes)", () => {
    const key = "5.6.7.8";
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.citizenReportsPerWindow; i += 1) allowReport(key, t0);
    expect(allowReport(key, t0).allowed).toBe(false);
    // 10 minutes + 1 ms later the earliest hits have expired.
    expect(allowReport(key, t0 + RATE_LIMITS.windowMinutes * 60000 + 1).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  it("derives the key from the CloudFront viewer address, stripping the port", () => {
    expect(clientKey({ "cloudfront-viewer-address": "203.0.113.7:51234" })).toBe("203.0.113.7");
  });
  it("falls back to a shared bucket when no address header is present", () => {
    expect(clientKey({})).toBe("anon");
  });
});
