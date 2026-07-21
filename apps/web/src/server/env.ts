import "server-only";
import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000")
});

const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().url()
});

const authenticationEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  AUTHORIZED_GITHUB_USER_IDS: z.string().min(1)
});

export const publicEnvironment = publicEnvironmentSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
});

export function requireDatabaseEnvironment() {
  return databaseEnvironmentSchema.parse({ DATABASE_URL: process.env.DATABASE_URL });
}

export function requireAuthenticationEnvironment() {
  return authenticationEnvironmentSchema.parse({
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    AUTHORIZED_GITHUB_USER_IDS: process.env.AUTHORIZED_GITHUB_USER_IDS
  });
}
