import "server-only";
import type { AuthorizedUser } from "@fantasyfb/authentication";
import { createRepositories } from "@fantasyfb/database";
import { createDraftRoom } from "@fantasyfb/draft-room";
import { getDatabase } from "./database";

function roomFor(user: AuthorizedUser) {
  return createDraftRoom({
    repository: createRepositories(getDatabase()).draftRepository,
    authorization: { userId: user.id }
  });
}

export function readDraftState(user: AuthorizedUser, draftId: string) {
  return roomFor(user).load(draftId);
}

export function appendDraftEvent(user: AuthorizedUser, draftId: string, input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("Draft event body must be an object.");
  }
  return roomFor(user).append({ ...input, draftId });
}
