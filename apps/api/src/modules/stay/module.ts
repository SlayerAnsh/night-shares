import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import type { Ports } from "../../container/ports";
export function createStayModule(_ports: Ports) {
  const notBuiltYet = (): never => {
    throw new ConnectError("not built yet", Code.Unimplemented);
  };
  const handler: ServiceImpl<typeof StayService> = {
    getPriceCalendar: notBuiltYet,
    quoteStay: notBuiltYet,
    lockQuote: notBuiltYet,
    createBooking: notBuiltYet,
    listTrips: notBuiltYet,
    checkIn: notBuiltYet,
    getReceipt: notBuiltYet,
    toggleSave: notBuiltYet,
    listSaves: notBuiltYet,
  };
  return { service: StayService, handler };
}
