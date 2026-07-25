import "server-only";
import {
  createLeagueGateway,
  LeagueGatewayError,
  type NormalizedLeague
} from "@fantasyfb/league-gateway";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "./auth/private-access";

const gateway = createLeagueGateway();

export async function discoverSleeperLeagues(input: {
  readonly username: string;
  readonly season: number;
}) {
  return gateway.discover({ provider: "sleeper", ...input });
}

export async function normalizeLeague(input: unknown): Promise<{
  league: NormalizedLeague;
  portableJson: string;
}> {
  const league = await gateway.normalize(input);
  return {
    league,
    portableJson: gateway.exportPortable(league)
  };
}

export function leagueGatewayErrorResponse(error: unknown): Response {
  if (error instanceof AuthenticationRequiredError) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  if (error instanceof AuthorizationDeniedError) {
    return Response.json({ error: "GitHub account not authorized" }, { status: 403 });
  }
  if (error instanceof LeagueGatewayError) {
    const status =
      error.code === "rate-limited"
        ? 429
        : error.code === "not-found"
          ? 404
          : error.code === "invalid-input"
            ? 400
            : 502;
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: error.retryAfterSeconds })
      },
      {
        status,
        ...(error.retryAfterSeconds === undefined
          ? {}
          : { headers: { "retry-after": String(error.retryAfterSeconds) } })
      }
    );
  }
  return Response.json({ error: "League gateway request failed." }, { status: 500 });
}
