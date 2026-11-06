import { createConnectChannelManager } from "./connect-channel-manager";
import type { HostDeps } from "./deps";
import { createOpenNights } from "./opening/open-nights";
import { createPreviewOpenNights } from "./opening/preview-open-nights";
import { createStopSelling } from "./opening/stop-selling";
import { createGetPayout } from "./payout/get-payout";
import { createWithdraw } from "./payout/withdraw";
import { createGetHotel } from "./reporting/get-hotel";
import { createGetNight } from "./reporting/get-night";
import { createGetPortfolio } from "./reporting/get-portfolio";
export function createHostUseCases(deps: HostDeps) {
  return {
    connectChannelManager: createConnectChannelManager(deps),
    openNights: createOpenNights(deps),
    previewOpenNights: createPreviewOpenNights(deps),
    stopSelling: createStopSelling(deps),
    getPayout: createGetPayout(deps),
    withdraw: createWithdraw(deps),
    getHotel: createGetHotel(deps),
    getNight: createGetNight(deps),
    getPortfolio: createGetPortfolio(deps),
  };
}
