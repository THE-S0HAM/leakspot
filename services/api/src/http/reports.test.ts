// End-to-end report flow against the router with in-memory adapters + FakeVision: create a run, post a
// low_water report and a leak_photo (tiny JPEG), classify each, and read the ticket back. Proves the
// two-step create→classify→ticket path and the ticket view fields the citizen app consumes.

import { createHash, randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";
import { afterEach, beforeEach } from "vitest";
import { createFakeVision } from "../adapters/fake/fake-vision";
import { createMemoryPhotoStore } from "../adapters/memory/memory-photo-store";
import { createMemoryRunStore } from "../adapters/memory/memory-run-store";
import { __resetRateLimitForTests } from "../app/rate-limit";
import { route, type RouterDeps, type RouterRequest } from "./router";

beforeEach(() => __resetRateLimitForTests());
afterEach(() => __resetRateLimitForTests());

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function makeCode(): string {
  let c = "";
  for (let i = 0; i < 8; i += 1) c += ALPHABET[randomInt(0, ALPHABET.length)];
  return c;
}
const CODE = makeCode();
const CODE_SHA = createHash("sha256").update(CODE).digest("hex");
const JPEG_B64 = Buffer.from(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])).toString(
  "base64",
);

function deps(): RouterDeps {
  let r = 0;
  return {
    runStore: createMemoryRunStore(),
    photoStore: createMemoryPhotoStore(),
    vision: createFakeVision("minor_drip"),
    commandCodeSha256: CODE_SHA,
    appVersion: "test",
    region: "ap-south-1",
    bedrockModel: "global.amazon.nova-2-lite-v1:0",
    dailyCap: 300,
    newReportId: () => `0000000000RPT${String((r += 1)).padStart(13, "0")}`,
  };
}

function req(method: string, path: string, body?: unknown, code?: string): RouterRequest {
  return { method, path, headers: code ? { "x-leakspot-code": code } : {}, body };
}

async function newRun(d: RouterDeps): Promise<string> {
  const res = await route(req("POST", "/runs", undefined, CODE), d);
  return (res.body as { runId: string }).runId;
}

describe("citizen report flow", () => {
  it("posts a low_water report, classifies it, and reads the ticket", async () => {
    const d = deps();
    const runId = await newRun(d);

    const create = await route(
      req("POST", `/runs/${runId}/reports`, {
        type: "low_water",
        x: 8,
        z: 93,
        lang: "en",
        selfChoice: "weak_flow",
      }),
      d,
    );
    expect(create.status).toBe(202);
    const reportId = (create.body as { reportId: string }).reportId;

    const classify = await route(req("POST", `/runs/${runId}/reports/${reportId}/classify`), d);
    expect(classify.status).toBe(200);

    const ticket = await route(req("GET", `/runs/${runId}/reports/${reportId}`), d);
    expect(ticket.status).toBe(200);
    expect(ticket.body).toMatchObject({ reportId, type: "low_water", rejected: false });
    expect(ticket.body).toHaveProperty("mergedCount");
  });

  it("posts a leak_photo, classifies it via FakeVision, and the ticket carries the label", async () => {
    const d = deps();
    const runId = await newRun(d);

    const create = await route(
      req("POST", `/runs/${runId}/reports`, {
        type: "leak_photo",
        x: 90,
        z: 92,
        lang: "en",
        selfChoice: "dripping",
        photoJpegBase64: JPEG_B64,
      }),
      d,
    );
    expect(create.status).toBe(202);
    const reportId = (create.body as { reportId: string }).reportId;

    const classify = await route(req("POST", `/runs/${runId}/reports/${reportId}/classify`), d);
    expect(classify.status).toBe(200);
    expect(classify.body).toMatchObject({ label: "minor_drip", rejected: false });

    const ticket = await route(req("GET", `/runs/${runId}/reports/${reportId}`), d);
    expect(ticket.body).toMatchObject({ reportId, type: "leak_photo", label: "minor_drip" });
  });

  it("rate-limits citizen reports (20 per client) but never limits command endpoints", async () => {
    const d = deps();
    const runId = await newRun(d);
    const addr = { "cloudfront-viewer-address": "9.9.9.9:5000" };
    const lowWater = { type: "low_water", x: 8, z: 93, lang: "en", selfChoice: "weak_flow" };

    // 20 reports from one client succeed; the 21st is 429.
    for (let i = 0; i < 20; i += 1) {
      const res = await route(reqWith("POST", `/runs/${runId}/reports`, lowWater, addr), d);
      expect(res.status).toBe(202);
    }
    const blocked = await route(reqWith("POST", `/runs/${runId}/reports`, lowWater, addr), d);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: "RATE_LIMITED" } });

    // Command endpoints (tick ×50 from the same client) are never rate-limited.
    for (let i = 0; i < 50; i += 1) {
      const res = await route(
        {
          method: "POST",
          path: `/runs/${runId}/tick`,
          headers: { ...addr, "x-leakspot-code": CODE },
          body: { count: 4 },
        },
        d,
      );
      expect([200, 409]).toContain(res.status); // 200 while slots remain, 409 only once the day is over
    }
  });
});

function reqWith(
  method: string,
  path: string,
  body: unknown,
  headers: Record<string, string>,
): RouterRequest {
  return { method, path, headers, body };
}
