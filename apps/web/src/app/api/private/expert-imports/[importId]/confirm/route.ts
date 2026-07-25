import { NextResponse } from "next/server";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../../../server/auth/private-access";
import { confirmPrivateExpertImport } from "../../../../../../server/expert-data";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const user = await authorizePrivateAccess();
    const { importId } = await context.params;
    const result = await confirmPrivateExpertImport(user, importId);
    return NextResponse.json({ import: result });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
