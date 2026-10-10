// XHR POST for a citizen report so the SegmentBar shows real upload progress (fetch has none). Same
// endpoint and body as api/client.createReport; separate because it needs the XHR progress event.

import type { CreateReportResponse } from "../../state/view-types";

export type CreateReportBody = {
  type: "leak_photo" | "low_water";
  x: number;
  z: number;
  lang: "en" | "hi" | "mr";
  selfChoice?: string;
  photoJpegBase64?: string;
};

export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** POST a report with upload progress. `onProgress(0..1)` fires as the body uploads. */
export function postReport(
  runId: string,
  body: CreateReportBody,
  onProgress: (fraction: number) => void,
): Promise<CreateReportResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/runs/${runId}/reports`);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => reject(new UploadError(0, "NETWORK", "Could not reach the server"));
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        parsed = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parsed as CreateReportResponse);
      } else {
        const env = parsed as {
          error?: { code?: string; message?: string; retryAfterSeconds?: number };
        };
        reject(
          new UploadError(
            xhr.status,
            env?.error?.code ?? "INTERNAL",
            env?.error?.message ?? `Upload failed (${xhr.status})`,
            env?.error?.retryAfterSeconds,
          ),
        );
      }
    };
    xhr.send(JSON.stringify(body));
  });
}
