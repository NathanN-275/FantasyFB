import { z } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../server/auth/private-access";
import { evaluateAndSaveTrade, listSavedTrades } from "../../../../server/trade-engine";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    return Response.json({ error: "GitHub account not authorized" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: "Invalid trade evaluation.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

export async function GET() {
  try {
    const user = await authorizePrivateAccess();
    return Response.json({ evaluations: await listSavedTrades(user) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await authorizePrivateAccess();
    const evaluation = await evaluateAndSaveTrade(user, await request.json());
    return Response.json({ evaluation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
