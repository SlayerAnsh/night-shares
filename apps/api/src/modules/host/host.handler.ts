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
        r.payoutAddress || undefined,
      ),
    }),
    getPortfolio: (_, ctx) => use.getPortfolio(host(ctx).id),
    getHotel: (r, ctx) => use.getHotel(host(ctx).id, r.propertyId, r.month),
    previewOpenNights: (r, ctx) =>
      use.previewOpenNights(host(ctx).id, r.selection),
    openNights: async (r, ctx) => ({
      nights: await use.openNights(host(ctx).id, r.selection),
    }),
    getNight: (r, ctx) => use.getNight(host(ctx).id, r.propertyId, r.date),
    getPayout: async (r, ctx) => {
      const user = host(ctx);
      const payout = use.getPayout(user.id, r.propertyId);
      const chain = await use.chainPayout(user.id, r.propertyId);
      if (chain) {
        payout.availableNow.micros =
          chain.pending > chain.debt ? chain.pending - chain.debt : 0n;
      }
      return {
        payout,
        payoutCredit: chain ? { micros: chain.payoutCredit } : undefined,
        hostDebt: chain ? { micros: chain.debt } : undefined,
        owedToGuest: chain ? { micros: chain.owedToGuest } : undefined,
        payoutBlock: chain?.block.number ?? 0n,
      };
    },
  };
}
