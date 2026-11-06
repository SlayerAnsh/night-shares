import type { Ports } from "../container/ports";
import { pollReports } from "../modules/double-sale/poll-reports";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../modules/market/use-cases/release-at-cutoff";
import { sweepHosts } from "./sweep/sweep-hosts";
export function createJobRegistry(ports: Ports) {
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  return [
    { name: "release-at-cutoff", run: () => releaseAtCutoff(deps) },
    { name: "double-sale", run: () => pollReports(ports) },
    { name: "host-sweep", run: () => sweepHosts(ports) },
  ];
}
