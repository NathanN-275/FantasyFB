import "server-only";
import type { AuthorizedUser } from "@fantasyfb/authentication";
import type { WorkspacePreferencesInput, WorkspaceRepository } from "@fantasyfb/contracts";
import { createRepositories } from "@fantasyfb/database";
import { getDatabase } from "./database";

function repository(): WorkspaceRepository {
  return createRepositories(getDatabase()).workspaceRepository;
}

export function getPrivateWorkspaceOverview(
  user: AuthorizedUser,
  workspaceRepository: WorkspaceRepository = repository()
) {
  return workspaceRepository.getOverview({ userId: user.id });
}

export function savePrivateWorkspacePreferences(
  user: AuthorizedUser,
  input: WorkspacePreferencesInput,
  workspaceRepository: WorkspaceRepository = repository()
) {
  return workspaceRepository.updatePreferences({ userId: user.id }, input);
}
