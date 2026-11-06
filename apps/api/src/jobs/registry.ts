import type { Ports } from "../container/ports";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../modules/market/use-cases/release-at-cutoff";
export function createJobRegistry(ports: Ports) {
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  return [{ name: "release-at-cutoff", run: () => releaseAtCutoff(deps) }];
}
