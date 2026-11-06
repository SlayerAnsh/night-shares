import { createConnectChannelManager } from "./connect-channel-manager";
import type { HostDeps } from "./deps";
import { createOpenNights } from "./opening/open-nights";
import { createPreviewOpenNights } from "./opening/preview-open-nights";
import { createGetPayout } from "./payout/get-payout";
import { createGetHotel } from "./reporting/get-hotel";
import { createGetNight } from "./reporting/get-night";
import { createGetPortfolio } from "./reporting/get-portfolio";
export function createHostUseCases(deps: HostDeps) {
  return {
    initialize: deps.repo.initialize,
    connectChannelManager: createConnectChannelManager(deps),
    openNights: createOpenNights(deps),
    previewOpenNights: createPreviewOpenNights(deps),
    getPayout: createGetPayout(deps),
    getHotel: createGetHotel(deps),
    getNight: createGetNight(deps),
    getPortfolio: createGetPortfolio(deps),
  };
}
