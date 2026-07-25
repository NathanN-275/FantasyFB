import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export * from "./repositories.js";
export * from "./authentication.js";
export * from "./schema.js";
export type { Database } from "./types.js";

export function createDatabase(databaseUrl: string) {
  return drizzle({ client: neon(databaseUrl), schema });
}
