import { SignOutButton } from "../../../components/auth-buttons";
import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main>
      <p>PRIVATE WORKSPACE</p>
      <h1>Account not authorized</h1>
      <p>
        This GitHub account is signed in but is not permitted to access the private workspace.
      </p>
      <SignOutButton />
      <p>
        <Link href="/">Return to the public demo</Link>
      </p>
    </main>
  );
}
