import { create } from "@bufbuild/protobuf";
import { toMicros } from "@night-shares/market-model";
import type { CreateBookingRequest } from "@night-shares/proto/stay/v1/stay_pb";
import { TripSchema } from "@night-shares/proto/stay/v1/trip_pb";
import { envValue } from "../../../../config/env";
import type { Ports } from "../../../../container/ports";
import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { format } from "../../../../shared/night-key";
import { bookOnChain } from "../../chain/book";
import { minMicros } from "../../pricing/min-micros";
import { routeNight } from "../../pricing/quote-night";
import { selection } from "../../pricing/selection";
import type { StayRepo } from "../../repo/stay-repo";
import { commitNights } from "./commit-nights";
import { settlement } from "./settlement";

export function createCreateBooking(ports: Ports, repo: StayRepo) {
  return async (input: CreateBookingRequest, user: User) => {
    if (envValue("ARC_NETWORK") === "mainnet" && !ports.chainExecutor)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "On-chain booking execution is unavailable on this network.",
      );
    if (ports.chainExecutor && ports.chainExecutor.mode !== "mock")
      return bookOnChain(ports, repo, input, user);
    const { lock, value, current, paid, reservation } = transaction(
      ports.db,
      () => {
        const lock = repo.locks.get(input.lockId);
        if (
          !lock ||
          lock.userId !== user.id ||
          lock.expiresAt <= ports.clock.now() ||
          lock.busy ||
          lock.tripId
        )
          throw new DomainError(
            "FAILED_PRECONDITION",
            "Quote lock is unavailable or expired.",
          );
        if (
          !input.guestName.trim() ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guestEmail)
        )
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Provide guest name and email.",
          );

        const { value, dates } = selection(ports, lock.quote.selection);
        const keys = dates.map((date) => format({ ...value, date }));
        for (const key of keys) {
          if (ports.inventory.get(key).released)
            throw new DomainError(
              "FAILED_PRECONDITION",
              "This night has closed.",
            );
        }
        const current = keys.map((key) => ({
          key,
          route: routeNight(ports.inventory.get(key), value.rooms),
        }));
        const locked = lock.quote.total?.micros ?? 0n;
        const total = current.reduce(
          (sum, n) => sum + toMicros(n.route.total),
          0n,
        );
        const paid = minMicros(total, locked);
        if (lock.expiresAt <= ports.clock.now())
          throw new DomainError(
            "FAILED_PRECONDITION",
            "Quote lock is unavailable or expired.",
          );
        const reservation = commitNights(
          ports,
          current,
          value.rooms,
          value.propertyId,
          user.id,
        );
        lock.busy = true;
        repo.locks.set(lock.id, lock);
        return { lock, value, current, paid, reservation };
      },
    );
    let committed = false;
    try {
      // Split the locked charge and subsidy at the source, without relying on incoming funds.
      let buyerRemaining = paid;
      const legs: Parameters<typeof ports.walletProvider.settle>[0] = [];
      for (const night of current) {
        for (const payment of settlement(night.route, {
          ports,
          propertyId: value.propertyId,
          buyer: user.walletAddress,
          recallPayments: reservation.recallPayments(night.key),
        })) {
          const buyerAmount = minMicros(payment.amount, buyerRemaining);
          buyerRemaining -= buyerAmount;
          if (buyerAmount > 0n)
            legs.push({
              from: user.walletAddress,
              to: payment.to,
              amount: buyerAmount,
              memo: "guest_booking",
            });
          if (payment.amount > buyerAmount)
            legs.push({
              from: "treasury",
              to: payment.to,
              amount: payment.amount - buyerAmount,
              memo: "quote_lock_subsidy",
            });
        }
      }
      try {
        await ports.walletProvider.settle(legs);
      } catch (error) {
        transaction(ports.db, () => {
          reservation.revert();
          lock.busy = false;
          repo.locks.set(lock.id, lock);
        });
        throw error;
      }
      committed = true;
      reservation.publish();
      const id = ports.ids.next("bk");
      const { hotelRef } = await ports.channelManager.pushReservation({
        ...value,
        bookingId: id,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
      });
      const fee = current.reduce((sum, n) => sum + toMicros(n.route.fee), 0n);
      const trip = create(TripSchema, {
        ...value,
        $typeName: undefined,
        id,
        ref: `NS-${id.split("_").at(-1)?.padStart(5, "0")}`,
        hotelRef,
        total: { micros: paid },
        fee: { micros: minMicros(fee, paid) },
      });
      transaction(ports.db, () => {
        repo.trips.set(id, {
          trip,
          userId: user.id,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          walletAddress: user.walletAddress,
          paidAt: ports.clock.now(),
        });
        lock.tripId = id;
        repo.locks.set(lock.id, lock);
      });
      return structuredClone(trip);
    } finally {
      // A failed settlement must not replay inventory mutations on retry.
      lock.busy = committed && !lock.tripId;
      repo.locks.set(lock.id, lock);
    }
  };
}
