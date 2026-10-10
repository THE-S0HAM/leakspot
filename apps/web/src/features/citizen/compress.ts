// Phone-side photo compression (product.md citizen journey): decode the file, scale the longest side to
// ≤ MAX_PHOTO_SIDE_PX, then encode JPEG, stepping quality down from 0.85 until ≤ MAX_PHOTO_BYTES.
// Re-encoding strips EXIF (the "location data removed" promise). The browser APIs (createImageBitmap,
// canvas, toBlob) are injected so the loop is unit-testable in jsdom, which has no canvas.

import { MAX_PHOTO_BYTES, MAX_PHOTO_SIDE_PX } from "@leakspot/contracts";

export type CompressResult = { base64: string; bytes: number; width: number; height: number };

export type Encoder = {
  decode: (
    file: Blob,
  ) => Promise<{ width: number; height: number; draw: (w: number, h: number) => void }>;
  /** Encode the last drawn canvas to a JPEG blob at the given quality (0–1). */
  encode: (quality: number) => Promise<Blob>;
};

const START_QUALITY = 0.85;
const MIN_QUALITY = 0.4;
const STEP = 0.1;

/** Fit (w, h) so the longest side is ≤ max, preserving aspect ratio. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = max / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

/**
 * Compress a photo to a base64 JPEG ≤ MAX_PHOTO_BYTES with the longest side ≤ MAX_PHOTO_SIDE_PX.
 * Throws "decode" on an undecodable file so the UI can show the "take a new photo" message.
 */
export async function compressPhoto(file: Blob, encoder: Encoder): Promise<CompressResult> {
  let decoded: Awaited<ReturnType<Encoder["decode"]>>;
  try {
    decoded = await encoder.decode(file);
  } catch {
    throw new Error("decode");
  }
  const { width, height } = fitWithin(decoded.width, decoded.height, MAX_PHOTO_SIDE_PX);
  decoded.draw(width, height);

  let quality = START_QUALITY;
  let blob = await encoder.encode(quality);
  while (blob.size > MAX_PHOTO_BYTES && quality > MIN_QUALITY) {
    quality = Math.round((quality - STEP) * 100) / 100;
    blob = await encoder.encode(quality);
  }
  const base64 = await blobToBase64(blob);
  return { base64, bytes: blob.size, width, height };
}

/** The real browser encoder (createImageBitmap + canvas + toBlob). Not used in tests. */
export function browserEncoder(): Encoder {
  let canvas: HTMLCanvasElement | null = null;
  return {
    async decode(file) {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw(w, h) {
          canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("decode");
          ctx.drawImage(bitmap, 0, 0, w, h);
          bitmap.close();
        },
      };
    },
    async encode(quality) {
      if (!canvas) throw new Error("decode");
      const current = canvas;
      return new Promise<Blob>((resolve, reject) => {
        current.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("decode"))),
          "image/jpeg",
          quality,
        );
      });
    },
  };
}
