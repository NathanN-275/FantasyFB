"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readPrivateWorkspaceIdentity as readAuthorizedWorkspaceIdentity } from "../../../server/auth/private-resources";
import { authorizePrivateAccess } from "../../../server/auth/private-access";
import { savePrivateWorkspacePreferences } from "../../../server/private-workspace";

const preferencesSchema = z.object({
  defaultLeagueId: z.string().uuid().optional(),
  defaultScoringFormat: z.enum(["standard", "half-ppr", "ppr"]),
  timezone: z.enum([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles"
  ]),
  compactRankings: z.boolean()
});

/** A minimal protected action that verifies authorization independently of the page render. */
export async function readPrivateWorkspaceIdentity() {
  return readAuthorizedWorkspaceIdentity();
}

/** Ownership always comes from the server-side session, never from submitted form fields. */
export async function updateWorkspacePreferences(formData: FormData) {
  const user = await authorizePrivateAccess();
  const defaultLeagueId = String(formData.get("defaultLeagueId") ?? "").trim();
  const input = preferencesSchema.parse({
    ...(defaultLeagueId ? { defaultLeagueId } : {}),
    defaultScoringFormat: formData.get("defaultScoringFormat"),
    timezone: formData.get("timezone"),
    compactRankings: formData.get("compactRankings") === "on"
  });
  await savePrivateWorkspacePreferences(user, {
    ...(input.defaultLeagueId ? { defaultLeagueId: input.defaultLeagueId } : {}),
    defaultScoringFormat: input.defaultScoringFormat,
    timezone: input.timezone,
    compactRankings: input.compactRankings
  });
  revalidatePath("/workspace");
}
