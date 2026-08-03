import { describe, expect, it } from "vitest";
import { loadPublicDemoFixtures } from "./public-demo";

const forbiddenKey = /(?:owner|user|oauth|token|secret|password|private|session)/i;

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
}

describe("public demo fixture loader", () => {
  it("loads only explicitly synthetic sample fixtures", () => {
    const fixture = loadPublicDemoFixtures();
    expect(fixture.visibility).toBe("sample");
    expect(fixture.synthetic).toBe(true);
    expect(fixture.label).toContain("SYNTHETIC SAMPLE DATA ONLY");
  });

  it("does not expose private ownership, OAuth, session, or secret-shaped fields", () => {
    expect(keysOf(loadPublicDemoFixtures()).filter((key) => forbiddenKey.test(key))).toEqual([]);
  });
});
