import { sql } from "drizzle-orm";
import { createDatabase } from "../src/index.js";
import { migrateDatabase } from "./migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required to reset a test database.");
if (databaseUrl === process.env.DATABASE_URL) {
  throw new Error("Refusing to reset TEST_DATABASE_URL because it matches DATABASE_URL.");
}

const database = createDatabase(databaseUrl);
await database.execute(sql.raw("drop schema public cascade"));
await database.execute(sql.raw("create schema public"));
await migrateDatabase(databaseUrl);
console.log("Test database was reset and migrations were reapplied.");
