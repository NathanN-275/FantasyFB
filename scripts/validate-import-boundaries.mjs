import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const workspaceRoots = ["apps", "modules", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const forbiddenInternalImport = /from\s+["']@fantasyfb\/[^"']+\/(?:src|internal)\//g;

async function filesAt(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = join(path, entry.name);
      if (entry.isDirectory()) return filesAt(child);
      return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf("."))) ? [child] : [];
    })
  );
  return nested.flat();
}

const files = (await Promise.all(workspaceRoots.map(filesAt))).flat();
const violations = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (forbiddenInternalImport.test(source)) violations.push(relative(process.cwd(), file));
  forbiddenInternalImport.lastIndex = 0;
}

if (violations.length > 0) {
  throw new Error(`Internal workspace imports are prohibited:\n${violations.join("\n")}`);
}
