// Server-side JPEG validation (security-and-access.md): verify the magic bytes and the decoded size
// cap. We never parse or display EXIF. Returns the decoded bytes on success.

import { Buffer } from "node:buffer";
import { MAX_PHOTO_BYTES } from "@leakspot/contracts";

export type JpegCheck =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: "not_jpeg" | "too_large" };

/** Decode a base64 JPEG and verify magic bytes (FF D8 FF) and the ≤ 400 KB cap. */
export function checkJpegBase64(base64: string): JpegCheck {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, reason: "not_jpeg" };
  }
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, reason: "not_jpeg" };
  }
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, bytes: new Uint8Array(bytes) };
}
