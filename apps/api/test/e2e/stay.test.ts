import { expect, test } from "bun:test";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import { createHarness } from "./harness";

const selection = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  checkIn: "2026-12-04",
  checkOut: "2026-12-06",
  adults: 2,
  rooms: 1,
};
const guest = { guestName: "E2E Guest", guestEmail: "guest@example.test" };

test("search, quote, lock, USDC booking, receipt, trips and verified check-in", async () => {
  const h = await createHarness();
  try {
    const { user, clients } = await h.signInAs("device");
    const { stays } = await clients.catalog.searchStays({
      destination: "velana",
      ...selection,
    });
    expect(stays).toHaveLength(1);
    expect(
      (await clients.catalog.getProperty({ propertyId: selection.propertyId }))
        .property?.id,
    ).toBe(selection.propertyId);
    const { nights } = await clients.stay.getPriceCalendar({
      ...selection,
      startDate: selection.checkIn,
      endDate: selection.checkOut,
    });
    expect(nights).toHaveLength(2);
    const { quote } = await clients.stay.quoteStay({ selection });
    const lock = await clients.stay.lockQuote({ quoteId: quote?.id });
    const wallet = h.container.ports.walletProvider;
    const before = await wallet.balance(user.walletAddress);
    const key = `${selection.propertyId}:${selection.roomTypeId}:${selection.checkIn}`;
    const booked = h.container.ports.inventory.get(key).state.booked;
    const { trip } = await clients.stay.createBooking({
      ...guest,
      lockId: lock.lockId,
    });
    expect(before - (await wallet.balance(user.walletAddress))).toBe(
      trip?.total?.micros ?? 0n,
    );
    expect(h.container.ports.inventory.get(key).state.booked).toBe(booked + 1);
    expect((await clients.stay.listTrips({})).upcoming[0]?.id).toBe(trip?.id);
    const receipt = await clients.stay.getReceipt({ tripId: trip?.id });
    expect(receipt.receipt?.walletAddress).toBe(user.walletAddress);
    expect(receipt.receipt?.trip).not.toHaveProperty("guestName");
    const { token } = h.container.ports.verifications.issue({
      userId: user.id,
      action: "check_in",
    });
    expect(
      (
        await clients.stay.checkIn({
          tripId: trip?.id,
          verificationToken: token,
        })
      ).trip?.checkedIn,
    ).toBe(true);
    await expect(
      clients.stay.checkIn({ tripId: trip?.id, verificationToken: token }),
    ).rejects.toThrow();
    expect(
      (await clients.stay.toggleSave({ propertyId: selection.propertyId }))
        .isSaved,
    ).toBe(true);
    expect((await clients.stay.listSaves({})).properties[0]?.id).toBe(
      selection.propertyId,
    );
    expect(
      (await clients.stay.toggleSave({ propertyId: selection.propertyId }))
        .isSaved,
    ).toBe(false);
  } finally {
    await h.close();
  }
});

test("locks expire after ten minutes", async () => {
  const h = await createHarness();
  try {
    const { clients } = await h.signInAs("device");
    const { quote } = await clients.stay.quoteStay({ selection });
    const lock = await clients.stay.lockQuote({ quoteId: quote?.id });
    (h.container.ports.clock as MockClock).advance(11 * 60_000);
    await expect(
      clients.stay.createBooking({
        ...guest,
        lockId: lock.lockId,
      }),
    ).rejects.toThrow("Quote lock is unavailable or expired.");
  } finally {
    await h.close();
  }
});
