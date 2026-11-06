import type { ServiceImpl } from "@connectrpc/connect";
import type { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import { requireUser } from "../../server/auth-context";
import { propertyToProto } from "../catalog/mappers/property";
import { lockToProto } from "./mappers/lock";
import type { createStayCases } from "./use-cases/create-stay-cases";
export function createStayHandler(
  cases: ReturnType<typeof createStayCases>,
): ServiceImpl<typeof StayService> {
  return {
    getPriceCalendar: (req) => ({ nights: cases.getPriceCalendar(req) }),
    quoteStay: (req) => ({ quote: cases.quoteStay(req.selection) }),
    lockQuote: (req, ctx) =>
      lockToProto(cases.lockQuote(req.quoteId, requireUser(ctx).id)),
    createBooking: async (req, ctx) => ({
      trip: await cases.createBooking(req, requireUser(ctx)),
    }),
    listTrips: (_req, ctx) => cases.listTrips(requireUser(ctx).id),
    tapReception: (req, ctx) =>
      cases.tapReception(req.bookingId, req.tagPayload, requireUser(ctx).id),
    reportWalk: (req, ctx) => cases.reportWalk(req.bookingId, requireUser(ctx)),
    checkIn: (req, ctx) => ({
      trip: cases.checkIn(
        req.tripId,
        req.verificationToken,
        requireUser(ctx).id,
      ),
    }),
    getReceipt: (req, ctx) => ({
      receipt: cases.getReceipt(req.tripId, requireUser(ctx).id),
    }),
    toggleSave: (req, ctx) => ({
      isSaved: cases.toggleSave(req.propertyId, requireUser(ctx).id),
    }),
    listSaves: (_req, ctx) => ({
      properties: cases.listSaves(requireUser(ctx).id).map(propertyToProto),
    }),
  };
}
