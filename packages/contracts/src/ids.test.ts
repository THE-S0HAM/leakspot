// Unit tests for the RunId and ReportId zod schemas.
// Pins the Crockford base32 alphabet (no I, L, O, U), asserts the three accepted
// forms, and asserts rejection of one value per rejection case in Req 8.2 and 8.4.

import { describe, expect, it } from "vitest";
import { ReportId, RunId } from "./ids";

// A valid ULID: 26 chars, first char in 0-7, every character Crockford (no I/L/O/U).
const VALID_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("RunId", () => {
  it("accepts a 5-character Crockford run id", () => {
    expect(RunId.safeParse("K7Q2X").success).toBe(true);
  });

  it("accepts the literal SHOWCASE", () => {
    expect(RunId.safeParse("SHOWCASE").success).toBe(true);
  });

  it("returns an accepted run id unchanged", () => {
    expect(RunId.parse("K7Q2X")).toBe("K7Q2X");
    expect(RunId.parse("SHOWCASE")).toBe("SHOWCASE");
  });

  it("rejects a non-string value", () => {
    expect(RunId.safeParse(12345).success).toBe(false);
    expect(RunId.safeParse(null).success).toBe(false);
  });

  it("rejects a run id shorter than 5 characters", () => {
    expect(RunId.safeParse("K7Q2").success).toBe(false);
  });

  it("rejects a run id longer than 5 characters", () => {
    expect(RunId.safeParse("K7Q2XY").success).toBe(false);
  });

  it("rejects a run id containing I", () => {
    expect(RunId.safeParse("K7Q2I").success).toBe(false);
  });

  it("rejects a run id containing L", () => {
    expect(RunId.safeParse("K7Q2L").success).toBe(false);
  });

  it("rejects a run id containing O", () => {
    expect(RunId.safeParse("K7Q2O").success).toBe(false);
  });

  it("rejects a run id containing U", () => {
    expect(RunId.safeParse("K7Q2U").success).toBe(false);
  });

  it("rejects a lowercase run id", () => {
    expect(RunId.safeParse("k7q2x").success).toBe(false);
  });

  it("rejects a run id with leading whitespace", () => {
    expect(RunId.safeParse(" K7Q2X").success).toBe(false);
  });

  it("rejects a run id with trailing whitespace", () => {
    expect(RunId.safeParse("K7Q2X ").success).toBe(false);
  });

  it("rejects a lowercase showcase", () => {
    expect(RunId.safeParse("showcase").success).toBe(false);
  });

  it("rejects a padded SHOWCASE", () => {
    expect(RunId.safeParse(" SHOWCASE").success).toBe(false);
  });
});

describe("ReportId", () => {
  it("accepts a valid ULID", () => {
    expect(ReportId.safeParse(VALID_ULID).success).toBe(true);
  });

  it("returns an accepted report id unchanged", () => {
    expect(ReportId.parse(VALID_ULID)).toBe(VALID_ULID);
  });

  it("rejects a non-string value", () => {
    expect(ReportId.safeParse(12345).success).toBe(false);
    expect(ReportId.safeParse(null).success).toBe(false);
  });

  it("rejects a report id shorter than 26 characters", () => {
    expect(ReportId.safeParse(VALID_ULID.slice(0, 25)).success).toBe(false);
  });

  it("rejects a report id longer than 26 characters", () => {
    expect(ReportId.safeParse(`${VALID_ULID}V`).success).toBe(false);
  });

  it("rejects a report id whose first character is 8", () => {
    expect(ReportId.safeParse(`8${VALID_ULID.slice(1)}`).success).toBe(false);
  });

  it("rejects a report id whose first character is 9", () => {
    expect(ReportId.safeParse(`9${VALID_ULID.slice(1)}`).success).toBe(false);
  });

  it("rejects a report id whose first character is a letter", () => {
    expect(ReportId.safeParse(`A${VALID_ULID.slice(1)}`).success).toBe(false);
  });

  it("rejects a report id with a lowercase character", () => {
    expect(ReportId.safeParse(`0${VALID_ULID.slice(1).toLowerCase()}`).success).toBe(false);
  });

  it("rejects a report id containing whitespace", () => {
    expect(ReportId.safeParse(`0 ${VALID_ULID.slice(2)}`).success).toBe(false);
  });

  it("rejects a report id containing L (outside Crockford)", () => {
    expect(ReportId.safeParse(`0L${VALID_ULID.slice(2)}`).success).toBe(false);
  });
});

describe("Crockford L rejection", () => {
  it("rejects L in both the RunId and ReportId schemas", () => {
    expect(RunId.safeParse("K7Q2L").success).toBe(false);
    expect(ReportId.safeParse(`0L${VALID_ULID.slice(2)}`).success).toBe(false);
  });
});
