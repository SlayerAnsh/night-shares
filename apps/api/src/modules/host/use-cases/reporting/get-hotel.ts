import { toMicros } from "@night-shares/market-model";
import { addDays, diffDays, parseDate } from "../../../../shared/dates";
import { DomainError } from "../../../../shared/errors/domain-error";
import { kpisOf, occupancyOf } from "../../mappers/aggregates";
import { guestMicros, mapNight } from "../../mappers/night";
import type { HostDeps } from "../deps";
import { createGetPayout } from "../payout/get-payout";
import { propertyOf } from "../property";
import { recordsFor } from "./records";
export function createGetHotel(deps: HostDeps) {
  return (userId: string, propertyId: string, month: string) => {
    const property = propertyOf(deps, userId, propertyId),
      today = deps.ports.clock.today();
    const selected = month || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(selected))
      throw new DomainError("INVALID_ARGUMENT", "Use a valid YYYY-MM month.");
    const start = `${selected}-01`;
    parseDate(start);
    const end = `${addDays(start, 32).slice(0, 7)}-01`;
    const calendar = recordsFor(
      deps,
      userId,
      propertyId,
      start,
      diffDays(start, end),
    );
    const next = recordsFor(deps, userId, propertyId, today, 60);
    const priceSeries = Array.from({ length: 60 }, (_, i) => {
      const date = addDays(today, i),
        rows = next.filter((r) => r.date === date);
      const prices = rows.map(guestMicros).filter((n) => n > 0n);
      return {
        date,
        guestPrice: {
          micros: prices.length
            ? prices.reduce((a, b) => a + b, 0n) / BigInt(prices.length)
            : 0n,
        },
        usualRate: {
          micros:
            rows.reduce((n, r) => n + toMicros(r.state.usualRate), 0n) /
            BigInt(rows.length || 1),
        },
      };
    });
    return {
      property,
      kpis: kpisOf(
        next.filter((r) => r.date < addDays(today, 30)),
        createGetPayout(deps)(userId, propertyId).availableNow.micros,
        property.rooms * 30 * 10,
      ),
      monthGlance: [...new Set(calendar.map((r) => r.date))].map((date) =>
        occupancyOf(
          date,
          calendar.filter((r) => r.date === date),
        ),
      ),
      priceSeries,
      calendar: calendar.map((r) => mapNight(r, deps.repo)),
    };
  };
}
