// Handler-layer tests for the router with in-memory adapters + FakeVision: every route's
// happy path, plus validation, auth and not-found. The command code is generated per test run.

import { createHash, randomInt } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeVision } from "../adapters/fake/fake-vision";
import { createMemoryPhotoStore } from "../adapters/memory/memory-photo-store";
import { createMemoryRunStore } from "../adapters/memory/memory-run-store";
import { __resetRateLimitForTests } from "../app/rate-limit";
import { route, stripApiPrefix, type RouterDeps, type RouterRequest } from "./router";

beforeEach(() => __resetRateLimitForTests());

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function makeCode(): string {
  let c = "";
  for (let i = 0; i < 8; i += 1) c += ALPHABET[randomInt(0, ALPHABET.length)];
  return c;
}
const CODE = makeCode();
const CODE_SHA = createHash("sha256").update(CODE).digest("hex");

// A 1x1-ish fake JPEG: magic bytes FF D8 FF + padding, base64.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const JPEG_B64 = Buffer.from(JPEG_BYTES).toString("base64");

function makeDeps(overrides: Partial<RouterDeps> = {}): RouterDeps {
  let runSeq = 0;
  let reportSeq = 0;
  return {
    runStore: createMemoryRunStore(),
    photoStore: createMemoryPhotoStore(),
    vision: createFakeVision("burst"),
    commandCodeSha256: CODE_SHA,
    appVersion: "test",
    region: "ap-south-1",
    bedrockModel: "global.amazon.nova-2-lite-v1:0",
    dailyCap: 300,
    newRunId: () => `R${(runSeq += 1)}0X`.slice(0, 5).padEnd(5, "2"),
    newReportId: () => `0000000000RPT${String((reportSeq += 1)).padStart(13, "0")}`,
    ...overrides,
  };
}

const command = { "x-leakspot-code": CODE };

function req(
  method: string,
  path: string,
  opts: { headers?: Record<string, string | undefined>; body?: unknown } = {},
): RouterRequest {
  return { method, path, headers: opts.headers ?? {}, body: opts.body };
}

describe("stripApiPrefix", () => {
  it("removes the /api prefix", () => {
    expect(stripApiPrefix("/api/health")).toBe("/health");
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api/runs/ABCDE/state/")).toBe("/runs/ABCDE/state");
  });
});

describe("GET /health", () => {
  it("returns ok with version metadata", async () => {
    const res = await route(req("GET", "/health"), makeDeps());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: "test" });
  });
});

describe("POST /auth/check", () => {
  it("accepts the right code and rejects a wrong one", async () => {
    const deps = makeDeps();
    expect((await route(req("POST", "/auth/check", { body: { code: CODE } }), deps)).status).toBe(
      200,
    );
    expect(
      (await route(req("POST", "/auth/check", { body: { code: "WRONGXYZ" } }), deps)).status,
    ).toBe(401);
  });

  it("validates the body", async () => {
    const res = await route(req("POST", "/auth/check", { body: {} }), makeDeps());
    expect(res.status).toBe(400);
  });
});

describe("command auth", () => {
  it("rejects POST /runs without the code header", async () => {
    const res = await route(req("POST", "/runs"), makeDeps());
    expect(res.status).toBe(401);
  });

  it("creates a run with the code header", async () => {
    const res = await route(req("POST", "/runs", { headers: command }), makeDeps());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("runId");
  });
});

describe("run lifecycle", () => {
  it("creates, reads public + state, ticks, and reports flow end to end", async () => {
    const deps = makeDeps();
    const created = await route(req("POST", "/runs", { headers: command }), deps);
    const runId = (created.body as { runId: string }).runId;

    // public view (no auth)
    const pub = await route(req("GET", `/runs/${runId}/public`), deps);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ runId, isShowcase: false });

    // state requires auth
    expect((await route(req("GET", `/runs/${runId}/state`), deps)).status).toBe(401);
    const state = await route(req("GET", `/runs/${runId}/state`, { headers: command }), deps);
    expect(state.status).toBe(200);

    // tick validation + happy
    expect(
      (
        await route(
          req("POST", `/runs/${runId}/tick`, { headers: command, body: { count: 9 } }),
          deps,
        )
      ).status,
    ).toBe(400);
    const ticked = await route(
      req("POST", `/runs/${runId}/tick`, { headers: command, body: { count: 1 } }),
      deps,
    );
    expect(ticked.status).toBe(200);

    // autopilot
    expect(
      (
        await route(
          req("POST", `/runs/${runId}/autopilot`, { headers: command, body: { on: true } }),
          deps,
        )
      ).status,
    ).toBe(200);
  });

  it("creates then classifies a leak_photo report", async () => {
    const deps = makeDeps();
    const runId = (
      (await route(req("POST", "/runs", { headers: command }), deps)).body as { runId: string }
    ).runId;

    const create = await route(
      req("POST", `/runs/${runId}/reports`, {
        body: {
          type: "leak_photo",
          x: 14,
          z: 86,
          lang: "en",
          selfChoice: "flowing",
          photoJpegBase64: JPEG_B64,
        },
      }),
      deps,
    );
    expect(create.status).toBe(202);
    const reportId = (create.body as { reportId: string }).reportId;

    const classified = await route(
      req("POST", `/runs/${runId}/reports/${reportId}/classify`),
      deps,
    );
    expect(classified.status).toBe(200);
    expect(classified.body).toMatchObject({ label: "burst" });

    const ticket = await route(req("GET", `/runs/${runId}/reports/${reportId}`), deps);
    expect(ticket.status).toBe(200);
    expect(ticket.body).toMatchObject({ reportId });
  });

  it("rejects an oversized photo with 413", async () => {
    const deps = makeDeps();
    const runId = (
      (await route(req("POST", "/runs", { headers: command }), deps)).body as { runId: string }
    ).runId;
    const bigJpeg = new Uint8Array(409_601);
    bigJpeg[0] = 0xff;
    bigJpeg[1] = 0xd8;
    bigJpeg[2] = 0xff;
    const res = await route(
      req("POST", `/runs/${runId}/reports`, {
        body: {
          type: "leak_photo",
          x: 14,
          z: 86,
          lang: "en",
          selfChoice: "flowing",
          photoJpegBase64: Buffer.from(bigJpeg).toString("base64"),
        },
      }),
      deps,
    );
    expect(res.status).toBe(413);
  });

  it("rejects a dispatch before 07:00 with CONFLICT", async () => {
    const deps = makeDeps();
    const runId = (
      (await route(req("POST", "/runs", { headers: command }), deps)).body as { runId: string }
    ).runId;
    // Tick once to reach 06:00 (slot 0), then dispatch: the crew-start rule fires before 07:00.
    await route(req("POST", `/runs/${runId}/tick`, { headers: command, body: { count: 1 } }), deps);
    const res = await route(
      req("POST", `/runs/${runId}/incidents/#1/dispatch`, { headers: command }),
      deps,
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "CONFLICT" } });
  });
});

describe("not found", () => {
  it("404s unknown routes and missing runs", async () => {
    const deps = makeDeps();
    expect((await route(req("GET", "/nope"), deps)).status).toBe(404);
    expect((await route(req("GET", "/runs/ZZZZZ/public"), deps)).status).toBe(404);
  });

  it("returns 400 (not 500) for a malformed percent-escape in the path", async () => {
    const res = await route(req("GET", "/runs/%E0%A4/public"), makeDeps());
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION" } });
  });

  it("decodes an encoded incident id so dispatch matches (#1 sent as %231)", async () => {
    const deps = makeDeps();
    const runId = (
      (await route(req("POST", "/runs", { headers: command }), deps)).body as { runId: string }
    ).runId;
    // No incident #1 yet → dispatch is a 409 CONFLICT (not 404), proving the id decoded to "#1".
    await route(req("POST", `/runs/${runId}/tick`, { headers: command, body: { count: 5 } }), deps);
    const res = await route(
      req("POST", `/runs/${runId}/incidents/%231/dispatch`, { headers: command }),
      deps,
    );
    expect([409, 200]).toContain(res.status);
  });
});

describe("command auth: every command route, fail closed", () => {
  // A real run + report so 401 (not 404) is what each route would otherwise answer.
  async function setup(): Promise<{ deps: RouterDeps; runId: string; reportId: string }> {
    const deps = makeDeps();
    const runId = (
      (await route(req("POST", "/runs", { headers: command }), deps)).body as { runId: string }
    ).runId;
    const created = await route(
      req("POST", `/runs/${runId}/reports`, {
        body: { type: "leak_photo", x: 30, z: 40, lang: "en", photoJpegBase64: JPEG_B64 },
      }),
      deps,
    );
    return { deps, runId, reportId: (created.body as { reportId: string }).reportId };
  }

  const routes = (runId: string, reportId: string): [string, string, unknown?][] => [
    ["POST", "/runs"],
    ["GET", `/runs/${runId}/state`],
    ["POST", `/runs/${runId}/tick`, { count: 1 }],
    ["POST", `/runs/${runId}/autopilot`, { on: true }],
    ["POST", `/runs/${runId}/incidents/#1/dispatch`],
    ["POST", `/runs/${runId}/incidents/#1/repair`],
    ["GET", `/runs/${runId}/reports/${reportId}/photo`],
  ];

  for (const [label, headers] of [
    ["no header", {}],
    ["a wrong code", { "x-leakspot-code": CODE === "ABCDEFGH" ? "HGFEDCBA" : "ABCDEFGH" }],
    ["a blank code", { "x-leakspot-code": "   " }],
  ] as const) {
    it(`answers 401 on every command route with ${label}`, async () => {
      const { deps, runId, reportId } = await setup();
      for (const [method, path, body] of routes(runId, reportId)) {
        const res = await route(req(method, path, { headers, body }), deps);
        expect(res.status, `${method} ${path}`).toBe(401);
      }
    });
  }

  for (const [label, hash] of [
    ["missing", undefined],
    ["empty", ""],
    ["malformed", "not-a-hash"],
    ["the hash of an empty code", createHash("sha256").update("").digest("hex")],
  ] as const) {
    it(`denies everything when COMMAND_CODE_SHA256 is ${label}`, async () => {
      const deps = makeDeps({ commandCodeSha256: hash as unknown as string });
      for (const code of [CODE, "", "   ", "ABCDEFGH"]) {
        const check = await route(req("POST", "/auth/check", { body: { code } }), deps);
        expect(check.status).not.toBe(200);
        const run = await route(
          req("POST", "/runs", { headers: { "x-leakspot-code": code } }),
          deps,
        );
        expect(run.status).toBe(401);
      }
    });
  }
});
