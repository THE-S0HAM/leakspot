// Command access-code check (security-and-access.md): the client sends x-leakspot-code; we compare
// SHA-256(trim + uppercase code) against COMMAND_CODE_SHA256 in constant time. No sessions in
// deadline mode — each command request carries the code header.

import { createHash, timingSafeEqual } from "node:crypto";

/** SHA-256 hex of the trimmed, uppercased code (case-insensitive, as the UI shows uppercase). */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** Constant-time check of a supplied code against the configured hash. */
export function codeMatches(suppliedCode: string | undefined, expectedSha256: string): boolean {
  if (!suppliedCode) return false;
  const supplied = Buffer.from(hashCode(suppliedCode), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}
