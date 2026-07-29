import { createStructuredLogger, resolveCorrelationId } from "@fantasyfb/observability";
import { NextResponse } from "next/server";

const logger = createStructuredLogger({
  component: "fantasyfb-web",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"
});

export function GET(request: Request) {
  const correlationId = resolveCorrelationId(request.headers.get("x-correlation-id"));
  logger.info("health.checked", { correlationId });
  return NextResponse.json(
    {
      status: "ok",
      service: "fantasyfb-web",
      checkedAt: new Date().toISOString(),
      correlationId
    },
    { headers: { "Cache-Control": "no-store", "x-correlation-id": correlationId } }
  );
}
