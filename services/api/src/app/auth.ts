// Command access-code check: the client sends x-leakspot-code; we compare
// SHA-256(trim + uppercase code) against COMMAND_CODE_SHA256 in constant time. There are no
// sessions: each command request carries the code header.

import { createHash, timingSafeEqual } from "node:crypto";

/** SHA-256 hex of the trimmed, uppercased code (case-insensitive, as the UI shows uppercase). */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

/**
 * Constant-time check of a supplied code against the configured hash. Fails CLOSED: a missing, empty
 * or malformed configured hash (or the hash of an empty string) denies everything, and so does a
 * missing or blank supplied code.
 */
export function codeMatches(suppliedCode: string | undefined, expectedSha256: string): boolean {
  if (typeof expectedSha256 !== "string" || !SHA256_HEX.test(expectedSha256)) return false;
  if (expectedSha256 === EMPTY_SHA256) return false;
  if (typeof suppliedCode !== "string" || suppliedCode.trim() === "") return false;
  const supplied = Buffer.from(hashCode(suppliedCode), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}
