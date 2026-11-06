import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { PriceSource } from "@night-shares/proto/stay/v1/trip_pb";
import { createHarness } from "./harness";

for (const isClosed of [false, true]) {
  test(`calendar preserves mixed window and rejects booking ${isClosed ? "closed" : "sold out"} night`, async () => {
    const h = await createHarness();
    try {
      const { clients } = await h.signInAs("device");
      const selection = {
        propertyId: "prop_velana",
        roomTypeId: "rt_velana_0",
        checkIn: "2026-12-04",
        checkOut: "2026-12-06",
        adults: 2,
        rooms: 1,
      };
      const request = {
        ...selection,
        startDate: selection.checkIn,
        endDate: selection.checkOut,
      };
      const before = await clients.stay.getPriceCalendar(request);
      const { quote } = await clients.stay.quoteStay({ selection });
      const lock = await clients.stay.lockQuote({ quoteId: quote?.id });
      h.container.ports.inventory.update(
        `${selection.propertyId}:${selection.roomTypeId}:${selection.checkIn}`,
        (r) => ({
          ...r,
          released: isClosed,
          state: { ...r.state, booked: r.state.S, q: r.state.S, held: 0 },
        }),
      );
      const { nights } = await h.clients.stay.getPriceCalendar(request);
      expect(nights.map((n) => n.date)).toEqual(["2026-12-04", "2026-12-05"]);
      expect(nights[0]?.isSoldOut).toBe(true);
      expect(nights[0]?.source).toBe(PriceSource.RECALL_CAP);
      expect(nights[0]?.price?.micros).toBeGreaterThan(0n);
      expect(nights[1]).toEqual(before.nights[1]);
      expect(nights[1]?.isSoldOut).toBe(false);
      expect(nights[1]?.price?.micros).toBeGreaterThan(0n);
      await expect(clients.stay.quoteStay({ selection })).rejects.toMatchObject(
        {
          code: Code.FailedPrecondition,
          rawMessage: "This night is sold out.",
        },
      );
      await expect(
        clients.stay.createBooking({
          lockId: lock.lockId,
          guestName: "Calendar Guest",
          guestEmail: "calendar@example.test",
        }),
      ).rejects.toMatchObject({
        code: Code.FailedPrecondition,
        rawMessage: isClosed
          ? "This night has closed."
          : "This night is sold out.",
      });
    } finally {
      await h.close();
    }
  });
}
