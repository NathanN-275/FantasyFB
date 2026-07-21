"use client";

import { useState } from "react";
import { authClient } from "../client/auth-client";

export function GitHubSignInButton() {
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    const result = await authClient.signIn.social({ provider: "github", callbackURL: "/workspace" });
    if (result.error) setError("GitHub sign-in could not be started. Please try again.");
  }

  return (
    <>
      <button type="button" onClick={signIn}>
        Continue with GitHub
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

export function SignOutButton() {
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <button type="button" onClick={signOut}>
      Sign out
    </button>
  );
}
