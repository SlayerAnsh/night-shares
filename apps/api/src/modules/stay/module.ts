import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import type { Ports } from "../../container/ports";
import { createSqliteStayRepo } from "./repo/stay-repo.sqlite";
import { createStayHandler } from "./stay.handler";
import { createStayCases } from "./use-cases/create-stay-cases";
export function createStayModule(ports: Ports) {
  const repo = createSqliteStayRepo(ports.db);
  const handler = createStayHandler(createStayCases(ports, repo));
  return { service: StayService, handler };
}
