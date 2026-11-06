import { HostService } from "@night-shares/proto/host/v1/host_pb";
import type { Ports } from "../../container/ports";
import { createHostHandler } from "./host.handler";
import { createSqliteHostRepo } from "./repo/host-repo.sqlite";
import { createHostUseCases } from "./use-cases/create-host-use-cases";
export function createHostModule(ports: Ports) {
  const repo = createSqliteHostRepo(ports);
  return {
    service: HostService,
    handler: createHostHandler(createHostUseCases({ ports, repo })),
  };
}
