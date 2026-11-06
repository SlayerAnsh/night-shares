import {
  book,
  hostPayout,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import type { Ports } from "../../../container/ports";
import type { DoubleSaleReport } from "../../../ports/booking-report/booking-report";
import { addDays } from "../../../shared/dates";
import { DomainError } from "../../../shared/errors/domain-error";
import { payoutOf } from "../../host/mappers/payout";
import { createSqliteHostRepo } from "../../host/repo/host-repo.sqlite";
import { adjustCoverAccount, coverAccount } from "../repo/cover-accounts";
import { holders, redeem } from "../repo/positions";
import { coverPayments } from "./cover-payments";
export function reserveReport(ports: Ports, report: DoubleSaleReport) {
  const { db } = ports;
  if (db.query("SELECT 1 FROM double_sale_reports WHERE id = ?").get(report.id))
    return;
  if (!Number.isSafeInteger(report.rooms) || report.rooms <= 0)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Report a positive number of rooms.",
    );
  if (
    db
      .query("SELECT 1 FROM market_settlements WHERE night_key = ?")
      .get(report.nightKey) ||
    db
      .query("SELECT 1 FROM stay_locks WHERE busy = 1 AND trip_id IS NULL")
      .get()
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Night settlement is in progress.",
    );
  if (
    db
      .query(
        "SELECT 1 FROM double_sale_reports WHERE night_key = ? AND status = 'pending'",
      )
      .get(report.nightKey)
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Night settlement is in progress.",
    );
  const before = ports.inventory.get(report.nightKey);
  db.query("INSERT INTO double_sale_reports VALUES (?, ?, ?, ?)").run(
    report.id,
    report.nightKey,
    report.rooms,
    before.released ? "done" : "pending",
  );
  if (before.released) return;
  const bid = toMicros(book(before.state).bids[0]?.price ?? 0);
  const property = ports.catalog.get(before.propertyId);
  const records = Array.from({ length: 60 }, (_, i) =>
    addDays(ports.clock.today(), i),
  ).flatMap((date) =>
    (property?.roomTypes ?? []).map((room) =>
      ports.inventory.get(`${before.propertyId}:${room.id}:${date}`),
    ),
  );
  const account = coverAccount(db, before.propertyId);
  const gross = payoutOf(
    records,
    createSqliteHostRepo(ports).withdrawn(before.propertyId) +
      account.spent +
      account.debt,
  ).availableNow.micros;
  const reserve = toMicros(hostPayout(before.state).heldForTraders);
  const positions = holders(db, before.key);
  const payments = positions.map((holder) => {
    const ask = before.state.traderAsks.find(
      (a) => a.who === holder.wallet_address,
    );
    const size = Number(holder.free) + (ask ? toTenths(ask.size) : 0);
    return {
      holder,
      size,
      amount: (bid * BigInt(size)) / 10n,
      to: holder.wallet_address,
    };
  });
  const remaining = Math.max(
    0,
    toTenths(before.state.held) - payments.reduce((sum, p) => sum + p.size, 0),
  );
  const cover = coverPayments(
    [
      ...payments,
      { amount: (bid * BigInt(remaining)) / 10n, to: "market_maker" },
    ],
    reserve,
    gross,
  );
  const spent = cover.pending;
  const debt = cover.debt;
  const reserveSpent = cover.reserve;
  for (const payment of payments)
    redeem(db, before.key, payment.holder, payment.amount, payment.size);
  adjustCoverAccount(db, before.propertyId, spent, debt);
  ports.inventory.update(before.key, (record) => ({
    ...record,
    released: true,
    stopped: true,
    state: {
      ...record.state,
      held: 0,
      traderAsks: [],
      cutoffPaid: (record.state.cutoffPaid ?? 0) + Number(reserveSpent) / 1e6,
    },
  }));
  return {
    before,
    positions,
    payments,
    spent,
    debt,
    bid,
    legs: cover.legs,
  };
}
