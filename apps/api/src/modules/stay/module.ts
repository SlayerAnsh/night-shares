import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import type { Ports } from "../../container/ports";
import { createMemoryStayRepo } from "./repo/stay-repo.memory";
import { createStayHandler } from "./stay.handler";
import { createStayCases } from "./use-cases/create-stay-cases";
export function createStayModule(ports: Ports) {
  const repo = createMemoryStayRepo();
  const handler = createStayHandler(createStayCases(ports, repo));
  return { service: StayService, handler };
}
