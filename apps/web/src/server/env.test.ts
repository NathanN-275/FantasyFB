import { describe, expect, it } from "vitest";

describe("server environment", () => {
  it("uses a local application URL by default", async () => {
    const { publicEnvironment } = await import("./env");
    expect(publicEnvironment.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });
});
