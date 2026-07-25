import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { stageAuthorizedExpertImport } from "../../../../../server/expert-data";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  seasonYear: z.number().int().min(2007).max(2100)
});

export async function POST(request: Request) {
  try {
    const user = await authorizePrivateAccess();
    const input = requestSchema.parse(await request.json());
    const preview = await stageAuthorizedExpertImport({ user, seasonYear: input.seasonYear });
    return NextResponse.json({ preview }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof AuthorizationDeniedError) {
      return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid expert API import request." }, { status: 400 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
