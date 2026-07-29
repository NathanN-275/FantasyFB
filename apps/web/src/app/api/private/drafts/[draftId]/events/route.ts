import { DraftRoomError } from "@fantasyfb/draft-room";
import {
  createStructuredLogger,
  resolveCorrelationId,
  userSafeError
} from "@fantasyfb/observability";
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

const logger = createStructuredLogger({
  component: "draft-synchronization",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"
});

function errorResponse(
  error: unknown,
  input: { readonly correlationId: string; readonly method: string; readonly draftId?: string }
) {
  if (error instanceof AuthenticationRequiredError) {
    logger.warn("draft.sync.rejected", { ...input, reason: "authentication_required" });
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    logger.warn("draft.sync.rejected", { ...input, reason: "authorization_denied" });
    return NextResponse.json({ error: "GitHub account not authorized" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Invalid draft event.", issues: error.issues },
      { status: 400 }
    );
  }
  if (error instanceof DraftRoomError && error.code === "sequence-conflict") {
    logger.warn("draft.sync.conflict", { ...input, code: error.code });
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error) {
    const safe = userSafeError(error);
    logger.error("draft.sync.failed", { ...input, ...safe.logFields });
    return NextResponse.json(
      { error: safe.message, code: safe.code, correlationId: input.correlationId },
      { status: 500 }
    );
  }
  throw error;
}

export async function GET(request: Request, context: RouteContext) {
  const correlationId = resolveCorrelationId(request.headers.get("x-correlation-id"));
  let draftId: string | undefined;
  try {
    const user = await authorizePrivateAccess();
    ({ draftId } = await context.params);
    const state = await readDraftState(user, draftId);
    logger.info("draft.sync.read", {
      correlationId,
      draftId,
      ownerUserId: user.id,
      status: state.status
    });
    return NextResponse.json(
      { state },
      { headers: { "x-correlation-id": correlationId, "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return errorResponse(error, { correlationId, method: "GET", ...(draftId ? { draftId } : {}) });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const correlationId = resolveCorrelationId(request.headers.get("x-correlation-id"));
  let draftId: string | undefined;
  try {
    const user = await authorizePrivateAccess();
    ({ draftId } = await context.params);
    const result = await appendDraftEvent(user, draftId, await request.json());
    logger.info("draft.sync.event-appended", {
      correlationId,
      draftId,
      ownerUserId: user.id,
      status: result.state.status,
      eventCount: result.state.eventCount
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { "x-correlation-id": correlationId, "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    return errorResponse(error, { correlationId, method: "POST", ...(draftId ? { draftId } : {}) });
  }
}
