import { createDatabase } from "../src/index";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("DATABASE_URL is not set; skipping database connection validation.");
  process.exit(0);
}

await createDatabase(databaseUrl).execute("select 1");
console.log("Database connection validated.");
