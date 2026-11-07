import { create } from "@bufbuild/protobuf";
import type { CreateBookingRequest } from "@night-shares/proto/stay/v1/stay_pb";
import {
  type StaySelection,
  TripSchema,
} from "@night-shares/proto/stay/v1/trip_pb";
import { type Hex, keccak256, stringToHex } from "viem";
import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import { ensureRouterAllowance } from "../../../ports/chain-executor/approvals";
import {
  type ChainCommand,
  deserialize,
  type ExecutionResult,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { CustodyWallet } from "../../../ports/wallet-custody/wallet-custody";
import { DomainError } from "../../../shared/errors/domain-error";
import { selection } from "../pricing/selection";
import type { StayRepo } from "../repo/stay-repo";
import { bookingAsks } from "./asks";
import {
  type ChainBooking,
  chainContext,
  confirmed,
  receiptEvents,
  slippageBound,
} from "./context";
import { ensureGuest } from "./guest";

type Payload = {
  input: CreateBookingRequest;
  user: User;
  wallet: CustodyWallet;
  value: StaySelection;
  key: string;
  cap: bigint;
  deadline: bigint;
};
type Intent = {
  lock_id: string;
  fingerprint: string;
  trip_id: string;
  user_id: string;
  payload: string;
  command: string | null;
  state: string;
  chain_booking_id: Hex | null;
  pms_synced: bigint;
};

async function executeBooking(
  ports: Ports,
  repo: StayRepo,
  input: CreateBookingRequest,
  user: User,
) {
  const { executor, reader, custody, deployment } = chainContext(ports);
  await reader.assertCurrent();
  const get = () =>
    ports.db
      .query<Intent, [string]>(
        "SELECT * FROM stay_chain_bookings WHERE lock_id = ?",
      )
      .get(input.lockId);
  let intent = get();
  if (intent && intent.user_id !== user.id)
    throw new DomainError("NOT_FOUND", "Quote lock not found.");
  if (!intent) {
    const wallet = await custody.getWallet({
      kind: "user",
      humanId: user.humanId,
    });
    if (
      !wallet ||
      wallet.address.toLowerCase() !== user.walletAddress.toLowerCase()
    )
      throw new DomainError(
        "PERMISSION_DENIED",
        "Guest custody wallet is unavailable.",
      );
    const head = await reader.head();
    transaction(ports.db, () => {
      if (get()) return;
      const lock = repo.locks.get(input.lockId);
      if (
        !lock ||
        lock.userId !== user.id ||
        lock.busy ||
        lock.tripId ||
        lock.expiresAt <= ports.clock.now()
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
      if (value.rooms !== 1 || dates.length !== 1)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "On-chain bookings support exactly 1 room for 1 night. Choose a single room and night.",
        );
      const cap = lock.quote.total?.micros ?? 0n;
      if (cap <= 0n)
        throw new DomainError(
          "FAILED_PRECONDITION",
          "Booking price must be positive.",
        );
      const payload: Payload = {
        input,
        user,
        wallet,
        value,
        key: `${value.propertyId}:${value.roomTypeId}:${value.checkIn}`,
        cap,
        deadline: head.timestamp + 600n,
      };
      ports.db
        .query(
          "INSERT INTO stay_chain_bookings (lock_id, fingerprint, trip_id, user_id, payload) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          input.lockId,
          reader.fingerprint,
          ports.ids.next("bk"),
          user.id,
          serialize(payload),
        );
      lock.busy = true;
      repo.locks.set(lock.id, lock);
    });
    intent = get();
  }
  if (!intent || intent.fingerprint !== reader.fingerprint)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Booking belongs to a different deployment.",
    );
  const payload = deserialize<Payload>(intent.payload);
  if (
    payload.input.guestName !== input.guestName ||
    payload.input.guestEmail !== input.guestEmail ||
    payload.user.id !== user.id
  )
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Booking retry must use the original guest details.",
    );
  if (intent.state === "reverted")
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Booking reverted. Request a new quote.",
    );
  const operationId = `stay:${reader.fingerprint}:${input.lockId}`;
  if (intent.state !== "booked") {
    let result: ExecutionResult;
    const operation = ports.db
      .query("SELECT 1 FROM chain_operations WHERE id = ?")
      .get(operationId);
    if (operation) result = await executor.recover(operationId);
    else {
      await ensureGuest(ports, user, payload.wallet, operationId);
      for (const approval of await ensureRouterAllowance({
        executor,
        reader,
        deployment,
        operationId,
        walletId: payload.wallet.walletId,
        owner: payload.wallet.address,
        router: "BookingRouter",
        amount: payload.cap,
        expiration: Number(payload.deadline),
      }))
        confirmed(approval);
      if (!intent.command) {
        const command: Extract<ChainCommand, { kind: "book" }> = {
          kind: "book",
          night: keccak256(stringToHex(payload.key)),
          maxPrice: payload.cap,
          asks: await bookingAsks(
            ports,
            payload.key,
            (await reader.head()).timestamp,
          ),
          hints: [],
          deadline: payload.deadline,
        };
        const simulation = await reader.simulate(
          command,
          payload.wallet.address,
        );
        const [, paid] = simulation.value as readonly [Hex, bigint];
        command.maxPrice = slippageBound(paid, payload.cap);
        ports.db
          .query(
            "UPDATE stay_chain_bookings SET command = ? WHERE lock_id = ? AND command IS NULL",
          )
          .run(serialize(command), input.lockId);
        intent = get() as Intent;
      }
      result = await executor.execute({
        operationId,
        walletId: payload.wallet.walletId,
        command: deserialize<ChainCommand>(intent.command as string),
      });
    }
    if (result.state === "reverted")
      transaction(ports.db, () => {
        ports.db
          .query(
            "UPDATE stay_chain_bookings SET state = 'reverted' WHERE lock_id = ?",
          )
          .run(input.lockId);
        const lock = repo.locks.get(input.lockId);
        if (lock) {
          lock.busy = false;
          repo.locks.set(lock.id, lock);
        }
      });
    const receipt = confirmed(result);
    const [event] = receiptEvents<{
      night: Hex;
      guest: Hex;
      bookingId: Hex;
      qty: bigint;
      paid: bigint;
    }>(result, deployment, "BookingRouter", "Booked");
    if (
      !event ||
      event.guest.toLowerCase() !== payload.wallet.address.toLowerCase() ||
      event.night !== keccak256(stringToHex(payload.key)) ||
      event.qty !== 10n ** 18n
    )
      throw new Error("Booking receipt does not match the reserved stay.");
    const booking = (
      await reader.read<ChainBooking>(
        {
          contract: "BookingRouter",
          functionName: "booking",
          args: [event.bookingId],
        },
        receipt.blockNumber,
      )
    ).value;
    if (
      booking.paid !== event.paid ||
      booking.paid > payload.cap ||
      booking.guest.toLowerCase() !== event.guest.toLowerCase() ||
      booking.night !== event.night ||
      booking.qty !== event.qty
    )
      throw new Error("Booking getter does not match the receipt.");
    const trip = create(TripSchema, {
      ...payload.value,
      $typeName: undefined,
      id: intent.trip_id,
      ref: `NS-${intent.trip_id}`,
      total: { micros: event.paid },
      chainBookingId: event.bookingId,
      chainTransactionHash: receipt.transactionHash,
      hotelSyncPending: true,
    });
    transaction(ports.db, () => {
      repo.trips.set(trip.id, {
        trip,
        userId: user.id,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        walletAddress: payload.wallet.address,
        paidAt: ports.clock.now(),
      });
      ports.db
        .query(
          "UPDATE stay_chain_bookings SET state = 'booked', chain_booking_id = ?, paid = ?, tx_hash = ? WHERE lock_id = ?",
        )
        .run(
          event.bookingId,
          event.paid,
          receipt.transactionHash,
          input.lockId,
        );
      const lock = repo.locks.get(input.lockId);
      if (lock) {
        lock.tripId = trip.id;
        lock.busy = false;
        repo.locks.set(lock.id, lock);
      }
    });
  }
  return syncBookingHotel(ports, repo, input.lockId);
}

export async function syncBookingHotel(
  ports: Ports,
  repo: StayRepo,
  lockId: string,
) {
  const row = ports.db
    .query<Intent, [string]>(
      "SELECT * FROM stay_chain_bookings WHERE lock_id = ?",
    )
    .get(lockId);
  if (row?.state !== "booked") throw new Error("Confirmed booking required.");
  const { reader } = chainContext(ports);
  if (row.fingerprint !== reader.fingerprint)
    throw new Error("Stale booking deployment.");
  const payload = deserialize<Payload>(row.payload);
  const saved = repo.trips.get(row.trip_id);
  if (!saved) throw new Error("Confirmed trip is missing.");
  if (!row.pms_synced) {
    try {
      const { hotelRef } = await ports.channelManager.pushReservation({
        ...payload.value,
        bookingId: row.trip_id,
        guestName: payload.input.guestName,
        guestEmail: payload.input.guestEmail,
      });
      transaction(ports.db, () => {
        saved.trip.hotelRef = hotelRef;
        saved.trip.hotelSyncPending = false;
        repo.trips.set(row.trip_id, saved);
        ports.db
          .query(
            "UPDATE stay_chain_bookings SET pms_synced = 1 WHERE lock_id = ?",
          )
          .run(lockId);
      });
    } catch {
      // The booking is paid and irreversible. Keep the durable outbox pending.
    }
  }
  return structuredClone(saved.trip);
}

export async function bookOnChain(
  ports: Ports,
  repo: StayRepo,
  input: CreateBookingRequest,
  user: User,
) {
  try {
    return await executeBooking(ports, repo, input, user);
  } catch (error) {
    transaction(ports.db, () => {
      const row = ports.db
        .query<Intent, [string]>(
          "SELECT * FROM stay_chain_bookings WHERE lock_id = ?",
        )
        .get(input.lockId);
      if (!row || row.user_id !== user.id || row.state === "booked") return;
      const operation = ports.db
        .query("SELECT 1 FROM chain_operations WHERE id = ?")
        .get(`stay:${row.fingerprint}:${input.lockId}`);
      // Once a journal entry exists, only its confirmed revert permits compensation.
      if (operation) return;
      ports.db
        .query(
          "UPDATE stay_chain_bookings SET state = 'reverted' WHERE lock_id = ?",
        )
        .run(input.lockId);
      const lock = repo.locks.get(input.lockId);
      if (lock) {
        lock.busy = false;
        repo.locks.set(lock.id, lock);
      }
    });
    throw error;
  }
}
