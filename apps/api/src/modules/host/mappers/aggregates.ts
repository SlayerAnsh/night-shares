import { cost, toMicros, toTenths } from "@night-shares/market-model";
import type { NightRecord } from "../../inventory/inventory-repo";
export function occupancyOf(date: string, records: NightRecord[]) {
  const sum = (value: (r: NightRecord) => number) =>
    records.reduce((n, r) => n + value(r), 0);
  return {
    date,
    allotment: { tenths: sum((r) => toTenths(r.state.S)) },
    booked: { tenths: sum((r) => toTenths(r.state.booked)) },
    held: { tenths: sum((r) => toTenths(r.state.held)) },
    onSale: {
      tenths: sum((r) =>
        r.stopped
          ? 0
          : Math.max(0, toTenths(r.state.S - r.state.booked - r.state.held)),
      ),
    },
  };
}
export function kpisOf(
  records: NightRecord[],
  available: bigint,
  capacityTenths: number,
) {
  const revenue = records.reduce(
    (n, { state: s }) => n + toMicros(cost(s.F, s.k, s.S, 0, s.booked)),
    0n,
  );
  const booked = records.reduce((n, r) => n + toTenths(r.state.booked), 0);
  return {
    revenue: { micros: revenue },
    averageRate: { micros: booked ? (revenue * 10n) / BigInt(booked) : 0n },
    occupancyBps: capacityTenths
      ? Math.round((booked * 10_000) / capacityTenths)
      : 0,
    availableNow: { micros: available },
  };
}
