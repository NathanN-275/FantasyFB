import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { createDatabase } from "../src/index.js";

const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export async function migrateDatabase(databaseUrl: string) {
  await migrate(createDatabase(databaseUrl), { migrationsFolder });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required to apply migrations.");
  }
  await migrateDatabase(databaseUrl);
  console.log("Database migrations applied.");
}
