import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import {
  DemandPreset,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import { TransactionKind } from "@night-shares/proto/wallet/v1/transaction_pb";
import { buildContainer } from "../../src/container/build-container";
import { payoutOf } from "../../src/modules/host/mappers/payout";
import { coverAccount } from "../../src/modules/walk/repo/cover-accounts";
import { markWalkFalse } from "../../src/modules/walk/use-cases/mark-false";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import { createHarness } from "./harness";

const selection = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  checkIn: "2026-12-04",
  checkOut: "2026-12-05",
  adults: 1,
  rooms: 1,
};

for (const emptyFund of [false, true])
  test(`walk isolates night earnings with empty fund ${emptyFund}`, async () => {
    const h = await createHarness();
    try {
      const guest = await h.signInAs("device", "walk-other-night");
      const { quote } = await guest.clients.stay.quoteStay({ selection });
      const { lockId } = await guest.clients.stay.lockQuote({
        quoteId: quote?.id,
      });
      const { trip } = await guest.clients.stay.createBooking({
        lockId,
        guestName: "Guest",
        guestEmail: "guest@example.test",
      });
      if (!trip?.total) throw new Error("Booking missing");
      const { ports } = h.container;
      const walkedKey = `${selection.propertyId}:${selection.roomTypeId}:${selection.checkIn}`;
      const otherKey = `${selection.propertyId}:${selection.roomTypeId}:2026-12-05`;
      ports.inventory.get(otherKey);
      // Isolate the funding source: the walked night has no earned host
      // proceeds, while the other night's inventory has earned proceeds.
      for (const record of ports.inventory.list({
        propertyId: selection.propertyId,
      })) {
        ports.inventory.update(record.key, (night) => ({
          ...night,
          state: {
            ...night.state,
            q: night.key === otherKey ? 1 : 0,
            held: 0,
            cutoffPaid: 0,
          },
        }));
      }
      expect(
        payoutOf([ports.inventory.get(walkedKey)]).availableNow.micros,
      ).toBe(0n);
      const otherEarnings = payoutOf([ports.inventory.get(otherKey)])
        .availableNow.micros;
      expect(otherEarnings).toBeGreaterThan(0n);
      const fundBefore = await ports.walletProvider.balance("cover_fund");
      if (emptyFund)
        await ports.walletProvider.transfer(
          "cover_fund",
          "pool",
          fundBefore,
          "empty fund",
        );
      const expectedPaid = emptyFund ? 0n : trip.total.micros;
      const expectedOwed = emptyFund ? trip.total.micros : 0n;
      const guestBefore = await ports.walletProvider.balance(
        guest.user.walletAddress,
      );
      (ports.clock as MockClock).set(Date.parse("2026-12-04T15:00:00Z"));
      const { tagPayload } = await guest.clients.stay.issueReceptionTag({
        bookingId: trip.id,
      });
      await guest.clients.stay.tapReception({ bookingId: trip.id, tagPayload });
      const result = await guest.clients.stay.reportWalk({
        bookingId: trip.id,
      });
      expect(result.paidToGuest?.micros).toBe(expectedPaid);
      expect(result.owedToGuest?.micros).toBe(expectedOwed);
      expect(result.guestId).toBe(guest.user.humanId);
      const listed = await guest.clients.stay.listTrips({});
      const persisted = [...listed.upcoming, ...listed.past].find(
        (item) => item.id === trip.id,
      );
      expect(persisted?.walk?.owedToGuest?.micros).toBe(expectedOwed);
      expect(persisted?.walk?.fromFund?.micros).toBe(expectedPaid);
      const property = await guest.clients.catalog.getProperty({
        propertyId: trip.propertyId,
      });
      expect(property.walkIncidents[0]).not.toHaveProperty("owedToGuest");
      expect(await ports.walletProvider.balance(guest.user.walletAddress)).toBe(
        guestBefore + expectedPaid,
      );
      expect(
        ports.db
          .query(
            "SELECT from_pending, from_fund FROM walk_reports WHERE id = ?",
          )
          .get(result.reportId),
      ).toEqual({
        from_pending: 0n,
        from_fund: expectedPaid,
      });
      expect(await ports.walletProvider.balance("cover_fund")).toBe(
        emptyFund ? 0n : fundBefore - trip.total.micros,
      );
      expect(coverAccount(ports.db, selection.propertyId)).toEqual({
        spent: 0n,
        debt: expectedPaid,
      });
      expect(
        payoutOf([ports.inventory.get(otherKey)]).availableNow.micros,
      ).toBe(otherEarnings);
    } finally {
      await h.close();
    }
  });

test("guest taps reception, reports walk, receives a full refund and host sees suspension", async () => {
  const h = await createHarness();
  try {
    const guest = await h.signInAs("device", "walk-guest");
    const other = await h.signInAs("device", "other");
    const host = await h.signInAs("orb", "host");
    const trips = [];
    // December 4 has only 2.5 rooms left. Keep two bookings for the walk
    // incidents and use the next night for the later reporting-ban check.
    const selections = [
      selection,
      selection,
      { ...selection, checkIn: "2026-12-05", checkOut: "2026-12-06" },
    ];
    for (const bookingSelection of selections) {
      const { quote } = await guest.clients.stay.quoteStay({
        selection: bookingSelection,
      });
      const { lockId } = await guest.clients.stay.lockQuote({
        quoteId: quote?.id,
      });
      const { trip } = await guest.clients.stay.createBooking({
        lockId,
        guestName: "Guest",
        guestEmail: "guest@example.test",
      });
      if (!trip) throw new Error("Booking missing");
      trips.push(trip);
    }
    const first = trips[0];
    if (!first) throw new Error("Booking missing");
    await expect(
      guest.clients.stay.reportWalk({ bookingId: first.id }),
    ).rejects.toThrow("within 24 hours");
    (h.container.ports.clock as MockClock).set(
      Date.parse("2026-12-04T15:00:00Z"),
    );
    await expect(
      other.clients.stay.tapReception({
        bookingId: first.id,
        tagPayload: selection.propertyId,
      }),
    ).rejects.toThrow("Trip not found");
    await expect(
      guest.clients.stay.tapReception({
        bookingId: first.id,
        tagPayload: "wrong",
      }),
    ).rejects.toThrow("does not match");
    await expect(
      guest.clients.stay.reportWalk({ bookingId: first.id }),
    ).rejects.toThrow("Tap the reception");
    const before = await h.container.ports.walletProvider.balance(
      guest.user.walletAddress,
    );
    const reports = [];
    for (const trip of trips.slice(0, 2)) {
      (h.container.ports.clock as MockClock).advance(1);
      const { tagPayload } = await guest.clients.stay.issueReceptionTag({
        bookingId: trip.id,
      });
      expect(
        (
          await guest.clients.stay.tapReception({
            bookingId: trip.id,
            tagPayload,
          })
        ).tappedAt,
      ).toBeDefined();
      const result = await guest.clients.stay.reportWalk({
        bookingId: trip.id,
      });
      expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.paidToGuest?.micros).toBe(trip.total?.micros ?? 0n);
      reports.push(result.reportId);
    }
    expect(
      await h.container.ports.walletProvider.balance(guest.user.walletAddress),
    ).toBe(
      before +
        trips
          .slice(0, 2)
          .reduce((sum, trip) => sum + (trip.total?.micros ?? 0n), 0n),
    );
    await expect(
      guest.clients.stay.reportWalk({ bookingId: first.id }),
    ).rejects.toThrow("already has a walk report");
    const txs = await guest.clients.wallet.listTransactions({});
    expect(
      txs.transactions.some(
        (tx) => tx.kind === TransactionKind.DOUBLE_SALE_REFUND,
      ),
    ).toBe(true);
    expect(
      (
        await h.clients.catalog.getProperty({
          propertyId: selection.propertyId,
        })
      ).walkIncidents,
    ).toHaveLength(2);
    expect(
      (await host.clients.host.getHotel({ propertyId: selection.propertyId }))
        .walkIncidents,
    ).toHaveLength(2);
    await expect(
      host.clients.host.openNights({
        selection: {
          propertyId: selection.propertyId,
          roomTypeIds: [selection.roomTypeId],
          dates: ["2026-12-24"],
          allotmentPercent: 100,
          demandPreset: DemandPreset.PEAK,
          releasePolicy: ReleasePolicy.ARRIVAL_14,
        },
      }),
    ).rejects.toThrow(
      "New openings are suspended after repeated walked guests.",
    );
    markWalkFalse(h.container.ports, reports[0] ?? "");
    await expect(
      guest.clients.stay.reportWalk({ bookingId: trips[2]?.id }),
    ).rejects.toThrow("banned for this World ID");
  } finally {
    await h.close();
  }
});

test("guest cannot self issue reception payloads when dev issuer is off", async () => {
  const h = await createHarness(
    buildContainer({
      port: 0,
      adapters: "mock",
      dbPath: ":memory:",
      clock: "mock",
      ids: "sequential",
      today: "2026-12-01",
    }),
  );
  try {
    const guest = await h.signInAs("device", "walk-disabled");
    await expect(
      guest.clients.stay.issueReceptionTag({ bookingId: "bk_test" }),
    ).rejects.toMatchObject({ code: Code.FailedPrecondition });
    expect(h.container.ports.issueReceptionTag).toBeUndefined();
  } finally {
    await h.close();
  }
});
