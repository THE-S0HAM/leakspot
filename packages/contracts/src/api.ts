// Request/response zod schemas for the API routes (api-contract.md), shared by the server and the web
// client so both validate the same shapes. Unknown fields are rejected (strict) on request bodies.

import { z } from "zod";
import { MAX_PHOTO_BYTES } from "./photo-limits";

// World bounds (scenario-jaldhara.md): x 0–100, z 0–104.
const X = z.number().min(0).max(100);
const Z = z.number().min(0).max(104);

export const Lang = z.enum(["en", "hi", "mr"]);
export type Lang = z.infer<typeof Lang>;

export const SelfChoice = z.enum(["flowing", "dripping", "weak_flow", "no_water"]);
export type SelfChoice = z.infer<typeof SelfChoice>;

/** POST /runs/{id}/reports body. A base64 JPEG, if present, must decode to ≤ 400 KB (checked server-side). */
export const CreateReportBody = z
  .object({
    type: z.enum(["leak_photo", "low_water"]),
    x: X,
    z: Z,
    lang: Lang,
    selfChoice: SelfChoice.optional(),
    photoJpegBase64: z
      .string()
      .max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4)
      .optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.type === "leak_photo") {
      if (!body.photoJpegBase64) {
        ctx.addIssue({
          code: "custom",
          message: "leak_photo requires a photo",
          path: ["photoJpegBase64"],
        });
      }
      if (body.selfChoice && body.selfChoice !== "flowing" && body.selfChoice !== "dripping") {
        ctx.addIssue({
          code: "custom",
          message: "leak_photo selfChoice must be flowing or dripping",
          path: ["selfChoice"],
        });
      }
    } else {
      if (body.photoJpegBase64) {
        ctx.addIssue({
          code: "custom",
          message: "low_water forbids a photo",
          path: ["photoJpegBase64"],
        });
      }
      if (body.selfChoice !== "weak_flow" && body.selfChoice !== "no_water") {
        ctx.addIssue({
          code: "custom",
          message: "low_water selfChoice must be weak_flow or no_water",
          path: ["selfChoice"],
        });
      }
    }
  });
export type CreateReportBody = z.infer<typeof CreateReportBody>;

export const TickBody = z.object({ count: z.number().int().min(1).max(4) }).strict();
export type TickBody = z.infer<typeof TickBody>;

export const AutopilotBody = z.object({ on: z.boolean() }).strict();
export type AutopilotBody = z.infer<typeof AutopilotBody>;

export const AuthCheckBody = z.object({ code: z.string() }).strict();
export type AuthCheckBody = z.infer<typeof AuthCheckBody>;

/** A pipeline stage line (api-contract.md "Report pipeline"). */
export const Stage = z.object({
  stage: z.enum([
    "received",
    "stored",
    "located",
    "classifying",
    "classified",
    "matching",
    "matched",
    "scored",
    "done",
    "rejected",
    "failed",
  ]),
  at: z.string(),
  detail: z.string().optional(),
});
export type Stage = z.infer<typeof Stage>;

export const ErrorCode = z.enum([
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RUN_EXPIRED",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "BUSY",
  "INTERNAL",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
