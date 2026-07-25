import "server-only";
import { createDatabase, type Database } from "@fantasyfb/database";
import { requireDatabaseEnvironment } from "./env";

let database: ReturnType<typeof createDatabase> | undefined;

export function getDatabase(): Database {
  database ??= createDatabase(requireDatabaseEnvironment().DATABASE_URL);
  return database;
}
