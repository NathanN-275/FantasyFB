import { describe, expect, it } from "vitest";
import { createStructuredLogger, resolveCorrelationId, userSafeError } from "./index";

describe("structured observability", () => {
  it("emits stable JSON fields and redacts secrets recursively", () => {
    const records: string[] = [];
    const logger = createStructuredLogger({
      component: "test-job",
      environment: "test",
      clock: () => new Date("2026-07-29T12:00:00.000Z"),
      sink: (record) => records.push(record)
    });

    logger.error("provider.failed", {
      correlationId: "request-123",
      database_url: "postgresql://user:password@example.neon.tech/database",
      nested: {
        authorization: "Bearer provider-token",
        detail: "connection postgresql://user:password@example.neon.tech/database failed"
      }
    });

    expect(JSON.parse(records[0]!)).toEqual({
      timestamp: "2026-07-29T12:00:00.000Z",
      level: "error",
      component: "test-job",
      event: "provider.failed",
      environment: "test",
      correlationId: "request-123",
      database_url: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]",
        detail: "connection [REDACTED] failed"
      }
    });
    expect(records[0]).not.toContain("password");
    expect(records[0]).not.toContain("provider-token");
  });

  it("preserves valid incoming correlation IDs and replaces invalid values", () => {
    expect(resolveCorrelationId("request-123", () => "generated")).toBe("request-123");
    expect(resolveCorrelationId("bad value", () => "generated")).toBe("generated");
  });

  it("keeps internal error details out of the user-facing message", () => {
    const result = userSafeError(new Error("provider token abc failed"));
    expect(result.message).not.toContain("provider token");
    expect(result.logFields).toMatchObject({ errorName: "Error" });
  });
});
