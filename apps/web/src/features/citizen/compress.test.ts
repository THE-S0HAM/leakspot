// Compression loop with an injected encoder (jsdom has no canvas). Verifies: scaling to the longest
// side, the quality step-down until ≤ MAX_PHOTO_BYTES, and the "decode" error on an undecodable file.

import { describe, expect, it, vi } from "vitest";
import { MAX_PHOTO_BYTES, MAX_PHOTO_SIDE_PX } from "@leakspot/contracts";
import { compressPhoto, fitWithin, type Encoder } from "./compress";

function blobOf(size: number): Blob {
  // A Blob whose .size is `size` and arrayBuffer resolves to that many bytes.
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

describe("fitWithin", () => {
  it("leaves a small image unscaled", () => {
    expect(fitWithin(800, 600, MAX_PHOTO_SIDE_PX)).toEqual({ width: 800, height: 600 });
  });
  it("scales the longest side down to the cap, preserving aspect", () => {
    const f = fitWithin(4000, 2000, MAX_PHOTO_SIDE_PX);
    expect(Math.max(f.width, f.height)).toBe(MAX_PHOTO_SIDE_PX);
    expect(f.width / f.height).toBeCloseTo(2, 1);
  });
});

describe("compressPhoto", () => {
  it("scales a large photo and steps quality down until it fits", async () => {
    let drawW = 0;
    // Each lower quality yields a smaller blob; only quality ≤ 0.65 fits.
    const sizes: Record<string, number> = {
      "0.85": MAX_PHOTO_BYTES + 50000,
      "0.75": MAX_PHOTO_BYTES + 20000,
      "0.65": MAX_PHOTO_BYTES - 1000,
    };
    const encode = vi.fn(async (q: number) => blobOf(sizes[q.toFixed(2)] ?? 1000));
    const encoder: Encoder = {
      decode: async () => ({
        width: 4000,
        height: 3000,
        draw: (w) => {
          drawW = w;
        },
      }),
      encode,
    };

    const result = await compressPhoto(blobOf(999999), encoder);
    expect(drawW).toBe(MAX_PHOTO_SIDE_PX); // longest side scaled to the cap
    expect(result.bytes).toBeLessThanOrEqual(MAX_PHOTO_BYTES);
    expect(encode).toHaveBeenCalledTimes(3); // 0.85 → 0.75 → 0.65
    expect(result.base64.length).toBeGreaterThan(0);
  });

  it("keeps the first quality when it already fits", async () => {
    const encode = vi.fn(async () => blobOf(100000));
    const encoder: Encoder = {
      decode: async () => ({ width: 500, height: 500, draw: () => {} }),
      encode,
    };
    await compressPhoto(blobOf(100000), encoder);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("throws 'decode' when the file cannot be decoded", async () => {
    const encoder: Encoder = {
      decode: async () => {
        throw new Error("bad");
      },
      encode: async () => blobOf(1),
    };
    await expect(compressPhoto(blobOf(1), encoder)).rejects.toThrow("decode");
  });
});
