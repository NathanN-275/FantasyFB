import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("production response headers", () => {
  it("applies browser security headers and prevents private API caching", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const rules = await nextConfig.headers!();
    const allRoutes = rules.find((rule) => rule.source === "/:path*");
    const privateApis = rules.find((rule) => rule.source === "/api/private/:path*");
    const names = new Set(allRoutes?.headers.map((header) => header.key));

    expect(names.has("Content-Security-Policy")).toBe(true);
    expect(names.has("Strict-Transport-Security")).toBe(true);
    expect(names.has("X-Content-Type-Options")).toBe(true);
    expect(names.has("X-Frame-Options")).toBe(true);
    expect(privateApis?.headers).toContainEqual({
      key: "Cache-Control",
      value: "private, no-store, max-age=0"
    });
  });
});
