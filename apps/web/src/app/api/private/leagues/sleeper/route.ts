import { authorizePrivateAccess } from "../../../../../server/auth/private-access";
import {
  discoverSleeperLeagues,
  leagueGatewayErrorResponse
} from "../../../../../server/league-gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await authorizePrivateAccess();
    const url = new URL(request.url);
    const username = url.searchParams.get("username") ?? "";
    const season = Number(url.searchParams.get("season"));
    const leagues = await discoverSleeperLeagues({ username, season });
    return Response.json({ leagues });
  } catch (error) {
    return leagueGatewayErrorResponse(error);
  }
}
