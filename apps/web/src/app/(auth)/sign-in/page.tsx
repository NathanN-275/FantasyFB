import { GitHubSignInButton } from "../../../components/auth-buttons";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main>
      <p>PRIVATE WORKSPACE</p>
      <h1>Sign in</h1>
      <p>
        Sign in with GitHub to request access. Only configured immutable GitHub account IDs can open
        the private workspace.
      </p>
      <GitHubSignInButton />
      <p>
        <Link href="/">Return to the public demo</Link>
      </p>
    </main>
  );
}
