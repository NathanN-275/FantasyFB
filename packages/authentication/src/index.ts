import "server-only";
import { redirect } from "next/navigation";
import type { UserId } from "@fantasyfb/contracts";

export interface AuthorizedUser {
  id: UserId;
  providerAccountId: string;
}

/** Authentication boundary; Prompt 4 will provide the Auth.js or Better Auth adapter. */
export interface AuthProvider {
  getAuthorizedUser(): Promise<AuthorizedUser | null>;
}

export async function requireAuthorizedUser(): Promise<AuthorizedUser> {
  redirect("/");
}
