import { describe, expect, it } from "vitest";
import { route, stripApiPrefix } from "./router";

describe("stripApiPrefix", () => {
  it("removes the /api prefix and keeps the remainder", () => {
    expect(stripApiPrefix("/api/health")).toBe("/health");
  });

  it("maps the bare /api to root", () => {
    expect(stripApiPrefix("/api")).toBe("/");
  });

  it("trims trailing slashes", () => {
    expect(stripApiPrefix("/api/health/")).toBe("/health");
  });

  it("leaves a path without the prefix unchanged", () => {
    expect(stripApiPrefix("/health")).toBe("/health");
  });
});

describe("route", () => {
  it("answers GET /health with ok and version metadata", () => {
    const result = route({ method: "GET", path: "/health" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true });
    const body = result.body as { version: unknown; region: unknown; bedrockModel: unknown };
    expect(typeof body.version).toBe("string");
    expect(typeof body.region).toBe("string");
    expect(typeof body.bedrockModel).toBe("string");
  });

  it("returns NOT_FOUND for an unknown route", () => {
    const result = route({ method: "GET", path: "/nope" });
    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("returns NOT_FOUND for a wrong method on a known path", () => {
    const result = route({ method: "POST", path: "/health" });
    expect(result.status).toBe(404);
  });
});
