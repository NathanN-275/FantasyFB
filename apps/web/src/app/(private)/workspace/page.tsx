import { requireAuthorizedUser } from "@fantasyfb/authentication";

export default async function WorkspacePage() {
  await requireAuthorizedUser();

  return (
    <main>
      <p>PRIVATE WORKSPACE</p>
      <h1>FantasyFB workspace</h1>
      <p>Authentication and workspace features will be completed in Prompt 4.</p>
    </main>
  );
}
