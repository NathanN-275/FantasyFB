import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a no-store liveness response with a correlation ID", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = GET(
      new Request("http://localhost/api/health", {
        headers: { "x-correlation-id": "health-request-123" }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-correlation-id")).toBe("health-request-123");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "fantasyfb-web",
      correlationId: "health-request-123"
    });
  });
});
