import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const journalPath = fileURLToPath(new URL("../../../drizzle/meta/_journal.json", import.meta.url));
const journal = JSON.parse(await readFile(journalPath, "utf8"));
const errors = [];

if (journal.dialect !== "postgresql") errors.push("Migration journal dialect must be PostgreSQL.");
if (!Array.isArray(journal.entries)) errors.push("Migration journal entries must be an array.");

const files = new Set((await readdir(migrationsFolder)).filter((file) => file.endsWith(".sql")));
for (const [position, entry] of (journal.entries ?? []).entries()) {
  if (!Number.isInteger(entry.idx) || entry.idx !== position) {
    errors.push(
      `Migration ${String(entry.tag)} has index ${String(entry.idx)}; expected ${position}.`
    );
  }
  if (typeof entry.tag !== "string" || !/^\d{4}_[a-z0-9_-]+$/i.test(entry.tag)) {
    errors.push(`Migration at index ${position} has an invalid tag.`);
    continue;
  }
  const fileName = `${entry.tag}.sql`;
  if (!files.has(fileName)) errors.push(`Journal entry ${entry.tag} has no SQL migration file.`);
  files.delete(fileName);
}
for (const file of files) errors.push(`SQL migration ${file} is not recorded in the journal.`);

if (errors.length) {
  throw new Error(
    `Migration validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`
  );
}
console.log(`Validated ${journal.entries.length} ordered PostgreSQL migrations.`);
