import type { Ports } from "../container/ports";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../modules/market/use-cases/release-at-cutoff";
import { pollReports } from "../modules/walk/poll-reports";
import { expireAsks } from "./expire-asks";
import { sweepHosts } from "./sweep/sweep-hosts";
export function createJobRegistry(ports: Ports) {
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  return [
    {
      name: "expire-asks",
      run: async () => {
        expireAsks(ports);
      },
    },
    { name: "release-at-cutoff", run: () => releaseAtCutoff(deps) },
    { name: "walk", run: () => pollReports(ports) },
    { name: "host-sweep", run: () => sweepHosts(ports) },
  ];
}
