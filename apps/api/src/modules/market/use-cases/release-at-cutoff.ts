import { cutoffRefund, toMicros } from "@night-shares/market-model";
import { transaction } from "../../../db/transaction";
import {
  type SettlementLeg,
  SYSTEM_ADDRESSES,
} from "../../../ports/wallet-provider/wallet-provider";
import { mulTenths } from "../../../shared/money";
import { toWholeTenths } from "../../../shared/tenths";
import { adjustCoverAccount } from "../../walk/repo/cover-accounts";
import { nightPending } from "../../walk/repo/night-pending";
import { finishOwed, reserveOwed } from "../../walk/repo/owed";
import { releaseChainCutoff } from "../chain/cutoff";
import { isChain } from "../chain/runtime";
import { cutoffAt } from "../cutoff";
import { type Deps, syncPosition } from "./context";

export async function releaseAtCutoff(deps: Deps) {
  if (isChain(deps.ports)) return releaseChainCutoff(deps);
  const errors: unknown[] = [];
  for (const night of deps.ports.inventory.list()) {
    if (night.released || cutoffAt(deps.ports, night) > deps.ports.clock.now())
      continue;
    try {
      await releaseNight(deps, night.key);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, "Cutoff settlements failed.");
}
async function releaseNight(deps: Deps, key: string) {
  const { ports, repo } = deps;
  const reservation = transaction(ports.db, () => {
    if (
      ports.db
        .query("SELECT 1 FROM market_settlements WHERE night_key = ? LIMIT 1")
        .get(key)
    )
      return;
    // Booking locks mark reservations busy before awaiting the wallet.
    if (
      ports.db
        .query(
          "SELECT 1 FROM stay_locks WHERE busy = 1 AND trip_id IS NULL LIMIT 1",
        )
        .get()
    )
      return;
    const before = ports.inventory.get(key);
    if (before.released || cutoffAt(ports, before) > ports.clock.now()) return;
    if (
      ports.db
        .query("SELECT 1 FROM walk_claim_locks WHERE property_id = ?")
        .get(before.propertyId) ||
      ports.db
        .query(
          "SELECT 1 FROM walk_reports WHERE property_id = ? AND status = 'pending'",
        )
        .get(before.propertyId) ||
      ports.db
        .query(
          "SELECT 1 FROM host_sweeps WHERE property_id = ? AND status = 'pending'",
        )
        .get(before.propertyId)
    )
      return;
    const perNight = toMicros(cutoffRefund(before.state).perNight);
    const holders = repo.holders(key).map((user) => {
      const position = repo.position(user.humanId, key);
      const previous = { ...position };
      syncPosition(deps, user, before);
      const escrow = position.escrow;
      const size = position.free + escrow;
      const amount = mulTenths(perNight, size);
      position.free = 0;
      position.escrow = 0;
      if (size)
        ports.db
          .query(
            "INSERT INTO market_cutoff_claims (night_key, human_id, size, amount, average) VALUES (?, ?, ?, ?, ?)",
          )
          .run(key, user.humanId, size, amount, position.average);
      return { user, position, previous, size, amount, escrow };
    });
    // Seeded holdings belong to the mock market maker, including unlisted inventory.
    const remaining = Math.max(
      0,
      toWholeTenths(before.state.held) -
        holders.reduce((sum, h) => sum + h.size, 0),
    );
    const legs: SettlementLeg[] = [
      {
        from: "pool",
        to: SYSTEM_ADDRESSES.cutoffClaims,
        amount: holders.reduce((sum, h) => sum + h.amount, 0n),
        memo: "cutoff claims escrow",
      },
    ];
    legs.push({
      from: "pool",
      to: SYSTEM_ADDRESSES.marketMaker,
      amount: mulTenths(perNight, remaining),
      memo: "cutoff refund",
    });
    legs.push({
      from: "pool",
      to: SYSTEM_ADDRESSES.rebatePool,
      amount: toMicros(cutoffRefund(before.state).haircut),
      memo: "cutoff haircut",
    });
    ports.inventory.update(key, (record) => ({
      ...record,
      released: true,
      stopped: true,
      cutoffAt: cutoffAt(ports, record),
      returnedTenths: toWholeTenths(record.state.S - record.state.booked),
      state: {
        ...record.state,
        cutoffPaid:
          Number(legs.reduce((sum, leg) => sum + leg.amount, 0n)) / 1e6,
        held: 0,
        traderAsks: [],
        hoursLeft: 0,
      },
    }));
    const unlocked = nightPending(ports, ports.inventory.get(key));
    const owed = reserveOwed(
      ports.db,
      before.propertyId,
      unlocked > 0n ? unlocked : 0n,
    );
    adjustCoverAccount(ports.db, before.propertyId, owed.amount, 0n);
    ports.db
      .query("INSERT INTO walk_cutoff_spent VALUES (?, ?)")
      .run(key, owed.amount);
    legs.push(...owed.legs);
    return {
      owed,
      before,
      holders,
      legs: legs.filter((leg) => leg.amount > 0n),
      perNight,
      remaining,
    };
  });
  if (!reservation) return;
  try {
    await ports.walletProvider.settle(reservation.legs);
  } catch (error) {
    transaction(ports.db, () => {
      finishOwed(ports.db, reservation.owed, true);
      adjustCoverAccount(
        ports.db,
        reservation.before.propertyId,
        -reservation.owed.amount,
        0n,
      );
      ports.db
        .query("DELETE FROM walk_cutoff_spent WHERE night_key = ?")
        .run(key);
      ports.db
        .query("DELETE FROM market_cutoff_claims WHERE night_key = ?")
        .run(key);
      ports.inventory.save(reservation.before);
      for (const holder of reservation.holders)
        Object.assign(holder.position, holder.previous);
    });
    throw error;
  }
  transaction(ports.db, () => {
    finishOwed(ports.db, reservation.owed);
    ports.db
      .query("UPDATE market_cutoff_claims SET ready = 1 WHERE night_key = ?")
      .run(key);
    const event = {
      nightKey: key,
      propertyId: reservation.before.propertyId,
      actor: "pool" as const,
    };
    for (const holder of reservation.holders) {
      if (!holder.size) continue;
      if (holder.escrow)
        ports.activity.append({
          ...event,
          kind: "ask_cancelled",
          userId: holder.user.id,
          tenths: holder.escrow,
        });
      ports.activity.append({
        ...event,
        kind: "cutoff_claimable",
        userId: holder.user.id,
        tenths: holder.size,
        priceMicros: reservation.perNight,
      });
    }
    if (reservation.remaining)
      ports.activity.append({
        ...event,
        kind: "cutoff_refund",
        tenths: reservation.remaining,
        priceMicros: reservation.perNight,
      });
    ports.activity.append({
      ...event,
      kind: "night_released",
      tenths: toWholeTenths(
        reservation.before.state.S - reservation.before.state.booked,
      ),
    });
  });
}
