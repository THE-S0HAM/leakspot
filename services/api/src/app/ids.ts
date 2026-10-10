// Id generation for runs and reports (api-contract.md). Run id: 5 Crockford base32 chars. Report id:
// a ULID (Crockford base32, time-ordered). Both use crypto randomness; the generated chars match the
// contracts' RunId/ReportId schemas.

import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U

/** A 5-character Crockford base32 run id, e.g. "K7Q2X". */
export function newRunId(): string {
  const bytes = randomBytes(5);
  let id = "";
  for (let i = 0; i < 5; i += 1) id += CROCKFORD[(bytes[i] ?? 0) % 32];
  return id;
}

/** A 26-char ULID: 10 chars of millisecond timestamp + 16 chars of randomness, Crockford base32. */
export function newReportId(now = Date.now()): string {
  let time = now;
  const timeChars: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    timeChars.unshift(CROCKFORD[time % 32] ?? "0");
    time = Math.floor(time / 32);
  }
  const rand = randomBytes(16);
  let randChars = "";
  for (let i = 0; i < 16; i += 1) randChars += CROCKFORD[(rand[i] ?? 0) % 32];
  return timeChars.join("") + randChars;
}

/** The citizen-facing ticket code: run id + last 4 of the report id (api-contract.md). */
export function ticketCode(runId: string, reportId: string): string {
  return `${runId}-${reportId.slice(-4)}`;
}
