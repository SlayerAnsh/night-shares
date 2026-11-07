import type { Ports } from "../container/ports";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { releaseAtCutoff } from "../modules/market/use-cases/release-at-cutoff";
import { pollReports } from "../modules/walk/poll-reports";
import { runChainJobs } from "./chain";
import { expireAsks } from "./expire-asks";
import { pushCutoff } from "./push-cutoff";
import { sweepHosts } from "./sweep/sweep-hosts";
export function createJobRegistry(ports: Ports) {
  if (ports.chainExecutor?.mode === "fork")
    return [
      { name: "chain-recovery-and-keepers", run: () => runChainJobs(ports) },
    ];
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  return [
    {
      name: "expire-asks",
      run: async () => {
        expireAsks(ports);
      },
    },
    { name: "release-at-cutoff", run: () => releaseAtCutoff(deps) },
    { name: "push-cutoff", run: () => pushCutoff(deps) },
    { name: "walk", run: () => pollReports(ports) },
    { name: "host-sweep", run: () => sweepHosts(ports) },
  ];
}
