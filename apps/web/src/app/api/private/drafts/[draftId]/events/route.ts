import { DraftRoomError } from "@fantasyfb/draft-room";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../../../server/auth/private-access";
import { appendDraftEvent, readDraftState } from "../../../../../../server/draft-room";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ draftId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Invalid draft event.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof DraftRoomError && error.code === "sequence-conflict") {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await authorizePrivateAccess();
    const { draftId } = await context.params;
    return NextResponse.json({ state: await readDraftState(user, draftId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await authorizePrivateAccess();
    const { draftId } = await context.params;
    const result = await appendDraftEvent(user, draftId, await request.json());
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
