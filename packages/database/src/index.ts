import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  return drizzle({ client: neon(databaseUrl), schema });
}
