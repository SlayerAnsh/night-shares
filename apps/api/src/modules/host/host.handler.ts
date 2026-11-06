import type { ServiceImpl } from "@connectrpc/connect";
import type { HostService } from "@night-shares/proto/host/v1/host_pb";
import { requireUser } from "../../server/auth-context";
import type { createHostUseCases } from "./use-cases/create-host-use-cases";
export function createHostHandler(
  use: ReturnType<typeof createHostUseCases>,
): ServiceImpl<typeof HostService> {
  return {
    connectChannelManager: async (r, ctx) => ({
      property: await use.connectChannelManager(
        requireUser(ctx).id,
        r.propertyId,
        r.pms,
      ),
    }),
    getPortfolio: (_, ctx) => use.getPortfolio(requireUser(ctx).id),
    getHotel: (r, ctx) =>
      use.getHotel(requireUser(ctx).id, r.propertyId, r.month),
    previewOpenNights: (r, ctx) =>
      use.previewOpenNights(requireUser(ctx).id, r.selection),
    openNights: (r, ctx) => ({
      nights: use.openNights(requireUser(ctx).id, r.selection),
    }),
    stopSelling: (r, ctx) => use.stopSelling(requireUser(ctx).id, r.nights),
    getNight: (r, ctx) =>
      use.getNight(requireUser(ctx).id, r.propertyId, r.date),
    getPayout: (r, ctx) => ({
      payout: use.getPayout(requireUser(ctx).id, r.propertyId),
    }),
    withdraw: (r, ctx) =>
      use.withdraw(requireUser(ctx), r.propertyId, r.amount?.micros),
  };
}
