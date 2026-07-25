import { authorizePrivateAccess } from "../../../../../server/auth/private-access";
import { leagueGatewayErrorResponse, normalizeLeague } from "../../../../../server/league-gateway";

const MAXIMUM_REQUEST_BYTES = 512_000;

export async function POST(request: Request) {
  try {
    await authorizePrivateAccess();
    const contents = await request.text();
    if (Buffer.byteLength(contents, "utf8") > MAXIMUM_REQUEST_BYTES) {
      return Response.json({ error: "League import exceeds the 500 KB limit." }, { status: 413 });
    }
    const input: unknown = JSON.parse(contents);
    return Response.json(await normalizeLeague(input));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return leagueGatewayErrorResponse(error);
  }
}
