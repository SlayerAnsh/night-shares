import type { Ports } from "../../../container/ports";
import { refreshChainWalkClaims } from "../chain/claims";
import type { StayRepo } from "../repo/stay-repo";
import { createCreateBooking } from "./booking/create-booking";
import { createGetPriceCalendar } from "./quotes/get-price-calendar";
import { createLockQuote } from "./quotes/lock-quote";
import { createQuoteStay } from "./quotes/quote-stay";
import { createListSaves } from "./saves/list-saves";
import { createToggleSave } from "./saves/toggle-save";
import { createCheckIn } from "./trips/check-in";
import { createGetReceipt } from "./trips/get-receipt";
import { createIssueReceptionTag } from "./trips/issue-reception-tag";
import { createListTrips } from "./trips/list-trips";
import { createReportWalk } from "./trips/report-walk";
import { createTapReception } from "./trips/tap-reception";
export function createStayCases(ports: Ports, repo: StayRepo) {
  return {
    onChain: ports.chainExecutor?.mode === "fork",
    getPriceCalendar: createGetPriceCalendar(ports),
    quoteStay: createQuoteStay(ports, repo),
    lockQuote: createLockQuote(ports, repo),
    createBooking: createCreateBooking(ports, repo),
    listTrips: createListTrips(ports, repo),
    refreshClaims: (userId: string) => refreshChainWalkClaims(ports, userId),
    issueReceptionTag: createIssueReceptionTag(ports, repo),
    tapReception: createTapReception(ports, repo),
    reportWalk: createReportWalk(ports, repo),
    checkIn: createCheckIn(ports, repo),
    getReceipt: createGetReceipt(repo),
    toggleSave: createToggleSave(ports, repo),
    listSaves: createListSaves(ports, repo),
  };
}
