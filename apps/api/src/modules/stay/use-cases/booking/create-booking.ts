import { create } from "@bufbuild/protobuf";
import { toMicros } from "@night-shares/market-model";
import type { CreateBookingRequest } from "@night-shares/proto/stay/v1/stay_pb";
import { PayMethod, TripSchema } from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../../container/ports";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { format } from "../../../../shared/night-key";
import { minMicros } from "../../pricing/min-micros";
import { routeNight } from "../../pricing/quote-night";
import { selection } from "../../pricing/selection";
import type { StayRepo } from "../../repo/stay-repo";
import { commitNights } from "./commit-nights";
import { settlement } from "./settlement";

export function createCreateBooking(ports: Ports, repo: StayRepo) {
  const pendingUsers = new Set<string>();
  return async (input: CreateBookingRequest, user: User) => {
    const lock = repo.locks.get(input.lockId);
    if (
      !lock ||
      lock.userId !== user.id ||
      lock.expiresAt <= ports.clock.now() ||
      lock.busy ||
      lock.tripId ||
      pendingUsers.has(user.id)
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Quote lock is unavailable or expired.",
      );
    if (
      ![PayMethod.USDC, PayMethod.CARD].includes(input.payMethod) ||
      !input.guestName.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guestEmail)
    )
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Provide guest name, email and payment method.",
      );
    lock.busy = true;
    pendingUsers.add(user.id);
    let committed = false;
    try {
      const { value, dates } = selection(ports, lock.quote.selection);
      const keys = dates.map((date) => format({ ...value, date }));
      const preview = () =>
        keys.map((key) => ({
          key,
          route: routeNight(ports.inventory.get(key), value.rooms),
        }));
      const initial = preview();
      const locked = lock.quote.total?.micros ?? 0n;
      const initialTotal = initial.reduce(
        (sum, n) => sum + toMicros(n.route.total),
        0n,
      );
      const charge = minMicros(initialTotal, locked);
      if (
        input.payMethod === PayMethod.USDC &&
        (await ports.walletProvider.balance(user.walletAddress)) < charge
      )
        throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
      // Validate recipients before changing inventory, including the seeded market maker.
      for (const to of new Set(
        initial.flatMap((n) => settlement(n.route).map((p) => p.to)),
      ))
        await ports.walletProvider.balance(to);
      if (input.payMethod === PayMethod.CARD)
        await ports.onramp.chargeCard({
          amount: charge,
          address: user.walletAddress,
        });
      const available = await ports.walletProvider.balance(user.walletAddress);
      const current = preview();
      const total = current.reduce(
        (sum, n) => sum + toMicros(n.route.total),
        0n,
      );
      const paid = minMicros(total, locked);
      if (available < paid)
        throw new DomainError("FAILED_PRECONDITION", "Not enough USDC.");
      if (lock.expiresAt <= ports.clock.now())
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Quote lock is unavailable or expired.",
        );
      commitNights(ports, current, value.rooms, value.propertyId, user.id);
      committed = true;
      // The platform funds increases during the ten-minute lock; sellers receive full proceeds.
      if (total > paid)
        await ports.walletProvider.transfer(
          "treasury",
          user.walletAddress,
          total - paid,
          "quote_lock_subsidy",
        );
      for (const night of current)
        for (const payment of settlement(night.route))
          await ports.walletProvider.transfer(
            user.walletAddress,
            payment.to,
            payment.amount,
            "guest_booking",
          );
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
        payMethod: input.payMethod,
      });
      repo.trips.set(id, {
        trip,
        userId: user.id,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        walletAddress: user.walletAddress,
        paidAt: ports.clock.now(),
      });
      lock.tripId = id;
      return structuredClone(trip);
    } finally {
      // A failed settlement must not replay inventory mutations on retry.
      lock.busy = committed && !lock.tripId;
      pendingUsers.delete(user.id);
    }
  };
}
