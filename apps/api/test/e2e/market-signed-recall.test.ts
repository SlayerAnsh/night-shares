import { expect, test } from "bun:test";
import {
  maxTotal,
  signedNight as night,
  signedFixture,
  signedKey,
} from "./market-signed-fixture";

test("recall reduces signed maker holdings and subsequent fill is limited to remaining tokens", async () => {
  const { h, market, buyer } = await signedFixture(20);
  try {
    const ask = (
      await market.postAsk({
        night,
        size: { tenths: 20 },
        price: { micros: 200000000n },
      })
    ).ask;
    h.container.ports.inventory.update(signedKey, (r) => ({
      ...r,
      state: { ...r.state, q: 10, booked: 8 },
    }));
    const guest = await h.signInAs("device", "signed_recall_guest");
    const { quote } = await guest.clients.stay.quoteStay({
      selection: {
        propertyId: night.propertyId,
        roomTypeId: night.roomTypeId,
        checkIn: night.date,
        checkOut: "2026-12-11",
        adults: 2,
        rooms: 1,
      },
    });
    const lock = await guest.clients.stay.lockQuote({ quoteId: quote?.id });
    await guest.clients.stay.createBooking({
      lockId: lock.lockId,
      guestName: "Test Guest",
      guestEmail: "guest@example.test",
    });
    expect((await market.getPortfolio({})).holdings[0]?.size?.tenths).toBe(10);
    expect(
      (await market.getBook({ night })).asks.find((a) => a.askId === ask?.id)
        ?.size?.tenths,
    ).toBe(10);
    const fill = await buyer.clients.market.buy({
      night,
      size: { tenths: 10 },
      maxTotal,
    });
    expect(
      fill.execution?.quote?.fills
        .filter((f) => f.askId === ask?.id)
        .reduce((n, f) => n + (f.size?.tenths ?? 0), 0),
    ).toBe(10);
    expect((await market.getPortfolio({})).holdings).toHaveLength(0);
  } finally {
    await h.close();
  }
});
