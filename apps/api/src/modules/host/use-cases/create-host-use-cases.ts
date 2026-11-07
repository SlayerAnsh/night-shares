import { configureChainInventory } from "../../inventory/chain-draft";
import { chainHostLiabilities } from "../chain/sweep";
import { createConnectChannelManager } from "./connect-channel-manager";
import type { HostDeps } from "./deps";
import { createOpenNights } from "./opening/open-nights";
import { createPreviewOpenNights } from "./opening/preview-open-nights";
import { createGetPayout } from "./payout/get-payout";
import { createGetHotel } from "./reporting/get-hotel";
import { createGetNight } from "./reporting/get-night";
import { createGetPortfolio } from "./reporting/get-portfolio";
export function createHostUseCases(deps: HostDeps) {
  configureChainInventory(
    deps.ports.db,
    deps.ports.chainExecutor?.mode === "fork"
      ? deps.ports.chainReader?.fingerprint
      : undefined,
  );
  return {
    initialize: deps.repo.initialize,
    connectChannelManager: createConnectChannelManager(deps),
    openNights: createOpenNights(deps),
    previewOpenNights: createPreviewOpenNights(deps),
    getPayout: createGetPayout(deps),
    chainPayout: (userId: string, propertyId: string) =>
      deps.ports.chainExecutor?.mode === "fork"
        ? chainHostLiabilities(deps, userId, propertyId)
        : undefined,
    getHotel: createGetHotel(deps),
    getNight: createGetNight(deps),
    getPortfolio: createGetPortfolio(deps),
  };
}
