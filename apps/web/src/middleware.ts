import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const correlationId = validCorrelationId(request.headers.get("x-correlation-id"))
    ? request.headers.get("x-correlation-id")!
    : crypto.randomUUID();
  requestHeaders.set("x-correlation-id", correlationId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

function validCorrelationId(value: string | null): boolean {
  return value !== null && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
