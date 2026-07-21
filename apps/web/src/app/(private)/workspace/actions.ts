"use server";

import { readPrivateWorkspaceIdentity as readAuthorizedWorkspaceIdentity } from "../../../server/auth/private-resources";

/** A minimal protected action that verifies authorization independently of the page render. */
export async function readPrivateWorkspaceIdentity() {
  return readAuthorizedWorkspaceIdentity();
}
