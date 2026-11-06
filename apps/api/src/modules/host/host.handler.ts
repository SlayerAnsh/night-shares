import type { HandlerContext, ServiceImpl } from "@connectrpc/connect";
import type { HostService } from "@night-shares/proto/host/v1/host_pb";
import { requireUser } from "../../server/auth-context";
import type { createHostUseCases } from "./use-cases/create-host-use-cases";
export function createHostHandler(
  use: ReturnType<typeof createHostUseCases>,
): ServiceImpl<typeof HostService> {
  function host(ctx: HandlerContext) {
    const user = requireUser(ctx);
    use.initialize(user);
    return user;
  }
  return {
    connectChannelManager: async (r, ctx) => ({
      property: await use.connectChannelManager(
        host(ctx).id,
        r.propertyId,
        r.pms,
      ),
    }),
    getPortfolio: (_, ctx) => use.getPortfolio(host(ctx).id),
    getHotel: (r, ctx) => use.getHotel(host(ctx).id, r.propertyId, r.month),
    previewOpenNights: (r, ctx) =>
      use.previewOpenNights(host(ctx).id, r.selection),
    openNights: async (r, ctx) => ({
      nights: await use.openNights(host(ctx).id, r.selection),
    }),
    stopSelling: (r, ctx) => use.stopSelling(host(ctx).id, r.nights),
    getNight: (r, ctx) => use.getNight(host(ctx).id, r.propertyId, r.date),
    getPayout: (r, ctx) => ({
      payout: use.getPayout(host(ctx).id, r.propertyId),
    }),
    withdraw: (r, ctx) =>
      use.withdraw(host(ctx), r.propertyId, r.amount?.micros),
  };
}
