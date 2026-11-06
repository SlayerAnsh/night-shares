import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { HostService } from "@night-shares/proto/host/v1/host_pb";
import type { Ports } from "../../container/ports";
export function createHostModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof HostService> = {
    connectChannelManager: notBuiltYet,
    getPortfolio: notBuiltYet,
    getHotel: notBuiltYet,
    previewOpenNights: notBuiltYet,
    openNights: notBuiltYet,
    stopSelling: notBuiltYet,
    getNight: notBuiltYet,
    getPayout: notBuiltYet,
    withdraw: notBuiltYet,
  };
  return { service: HostService, handler };
}
