// Unit test pinning the two citizen-photo size limits to their exact values,
// so the server seed-photo check and later client compression share one source.

import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTO_SIDE_PX } from "./photo-limits";

describe("photo limit constants", () => {
  it("pins the maximum photo byte size to 409600", () => {
    expect(MAX_PHOTO_BYTES).toBe(409_600);
  });

  it("pins the maximum photo side length to 1024 pixels", () => {
    expect(MAX_PHOTO_SIDE_PX).toBe(1024);
  });
});
