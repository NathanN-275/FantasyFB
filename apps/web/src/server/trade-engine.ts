import "server-only";
import type { AuthorizedUser } from "@fantasyfb/authentication";
import { createRepositories } from "@fantasyfb/database";
import { createTradeEngine, tradeEngineInputSchema } from "@fantasyfb/trade-engine";
import { getDatabase } from "./database";

function repositoryFor(user: AuthorizedUser) {
  return {
    authorization: { userId: user.id },
    repository: createRepositories(getDatabase()).tradeRepository
  };
}

export async function evaluateAndSaveTrade(user: AuthorizedUser, input: unknown) {
  const normalized = tradeEngineInputSchema.parse(input);
  const evaluation = createTradeEngine().evaluate(normalized);
  const { authorization, repository } = repositoryFor(user);
  return repository.save(authorization, {
    ...(normalized.league ? { leagueConfigurationId: normalized.league.id } : {}),
    status: "evaluated",
    sideA: normalized.trade.sideA,
    sideB: normalized.trade.sideB,
    result: evaluation
  });
}

export function listSavedTrades(user: AuthorizedUser) {
  const { authorization, repository } = repositoryFor(user);
  return repository.list(authorization);
}
