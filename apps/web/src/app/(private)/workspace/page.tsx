import { SignOutButton } from "../../../components/auth-buttons";
import { ExpertImportPanel } from "../../../components/expert-import-panel";
import { LeagueGatewayPanel } from "../../../components/league-gateway-panel";
import { requireAuthorizedUser } from "../../../server/auth/private-access";
import { getExpertDataStatus } from "../../../server/expert-data";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireAuthorizedUser();
  const currentSeason = new Date().getFullYear();
  const expertStatus = await getExpertDataStatus(currentSeason);

  return (
    <main>
      <p>PRIVATE WORKSPACE</p>
      <h1>FantasyFB workspace</h1>
      <p>Your account is authorized. Private imports remain visible only to this account.</p>
      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Account information</h2>
        <dl>
          <dt>GitHub account ID</dt>
          <dd>{user.providerAccountId}</dd>
          <dt>Display name</dt>
          <dd>{user.displayName ?? "Not provided"}</dd>
          <dt>Email</dt>
          <dd>{user.email ?? "Not provided"}</dd>
        </dl>
      </section>
      <LeagueGatewayPanel defaultSeason={currentSeason} />
      <ExpertImportPanel expertStatus={expertStatus} defaultSeason={currentSeason} />
      <SignOutButton />
    </main>
  );
}
