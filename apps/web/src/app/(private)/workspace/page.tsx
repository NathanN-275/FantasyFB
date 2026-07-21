import { SignOutButton } from "../../../components/auth-buttons";
import { requireAuthorizedUser } from "../../../server/auth/private-access";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireAuthorizedUser();

  return (
    <main>
      <p>PRIVATE WORKSPACE</p>
      <h1>FantasyFB workspace</h1>
      <p>Your account is authorized. Fantasy features will be added in later prompts.</p>
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
      <SignOutButton />
    </main>
  );
}
