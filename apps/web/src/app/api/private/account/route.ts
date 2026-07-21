import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError
} from "../../../../server/auth/private-access";
import { readPrivateAccount } from "../../../../server/auth/private-resources";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ account: await readPrivateAccount() });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
    }
    throw error;
  }
}
