// S3 PhotoStore adapter: stores private JPEGs at photos/{runId}/{reportId}.jpg and makes a 5-minute
// presigned GET URL for command users. Only adapters/ may import @aws-sdk/*.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PhotoStore } from "../../ports/photo-store";

function isNoSuchKey(error: unknown): boolean {
  return error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound");
}

const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes
const objectKey = (runId: string, reportId: string): string => `photos/${runId}/${reportId}.jpg`;

export type S3PhotoStoreOptions = { bucket: string; client?: S3Client };

export function createS3PhotoStore(options: S3PhotoStoreOptions): PhotoStore {
  const client = options.client ?? new S3Client({});
  const bucket = options.bucket;

  return {
    async put(runId, reportId, jpeg) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey(runId, reportId),
          Body: jpeg,
          ContentType: "image/jpeg",
        }),
      );
    },

    async getBytes(runId, reportId) {
      try {
        const out = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey(runId, reportId) }),
        );
        const bytes = await out.Body?.transformToByteArray();
        return bytes ?? undefined;
      } catch (error) {
        if (isNoSuchKey(error)) return undefined;
        throw error;
      }
    },

    async presignedGetUrl(runId, reportId) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey(runId, reportId) });
      return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
    },
  };
}
