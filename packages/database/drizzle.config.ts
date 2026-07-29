import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://placeholder:placeholder@localhost:5432/placeholder"
  },
  strict: true,
  verbose: true
});
