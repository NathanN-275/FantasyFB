import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { refreshAdpSnapshot } from "../../../../../server/expert-data";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  seasonYear: z.number().int().min(2007).max(2100),
  scoringFormat: z.enum(["standard", "half-ppr", "ppr", "2qb", "dynasty", "rookie"]),
  leagueSize: z.number().int().min(2).max(32)
});

export async function POST(request: Request) {
  try {
    await authorizePrivateAccess();
    const input = requestSchema.parse(await request.json());
    const snapshot = await refreshAdpSnapshot(input);
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid ADP snapshot request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
