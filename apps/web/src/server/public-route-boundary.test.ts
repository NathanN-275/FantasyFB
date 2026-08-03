import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../app/(public)");
const forbiddenReference =
  /(?:api\/private|server\/auth|server\/database|server\/private-workspace|AUTHORIZED_GITHUB|AUTH_SECRET|DATABASE_URL)/;

async function pageFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return pageFiles(path);
      return entry.name === "page.tsx" ? [path] : [];
    })
  );
  return nested.flat();
}

describe("public route boundary", () => {
  it("does not reference private APIs, authentication, database access, or secrets", async () => {
    const violations: string[] = [];
    for (const file of await pageFiles(publicRoot)) {
      const source = await readFile(file, "utf8");
      if (forbiddenReference.test(source)) violations.push(relative(publicRoot, file));
    }
    expect(violations).toEqual([]);
  });
});
