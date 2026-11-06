import { toMicros } from "@night-shares/market-model";
import { addDays } from "../../../../shared/dates";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { kpisOf, occupancyOf } from "../../mappers/aggregates";
import { guestMicros } from "../../mappers/night";
import type { HostDeps } from "../deps";
import { createGetPayout } from "../payout/get-payout";
import { propertyOf } from "../property";
import { recordsFor } from "./records";
export function createGetPortfolio(deps: HostDeps) {
  return (userId: string) => {
    const today = deps.ports.clock.today(),
      all: NightRecord[] = [];
    let capacity = 0,
      available = 0n;
    const alerts: { propertyId: string; date: string; message: string }[] = [];
    const hotels = [...deps.repo.connections(userId).keys()].map(
      (propertyId) => {
        const p = propertyOf(deps, userId, propertyId);
        const records = recordsFor(deps, userId, propertyId, today, 60);
        all.push(...records);
        capacity += p.rooms * 30 * 10;
        const payout = createGetPayout(deps)(userId, propertyId);
        available += payout.availableNow.micros;
        const below = new Set(
          records
            .filter(
              (r) =>
                r.date < addDays(today, 7) &&
                guestMicros(r) > 0n &&
                guestMicros(r) < toMicros(r.state.usualRate),
            )
            .map((r) => r.date),
        ).size;
        const newYear = `${today.slice(0, 4)}-12-31`;
        const nye = records.filter((r) => r.date === newYear);
        if (nye.length && nye.every((r) => r.stopped || r.state.S === 0))
          alerts.push({
            propertyId,
            date: newYear,
            message: "New Year not open yet",
          });
        else if (below >= 3)
          alerts.push({
            propertyId,
            date: today,
            message: `${below} nights selling below usual rate this week`,
          });
        return {
          propertyId,
          name: p.name,
          city: p.city,
          kpis: kpisOf(
            records.filter((r) => r.date < addDays(today, 30)),
            payout.availableNow.micros,
            p.rooms * 30 * 10,
          ),
        };
      },
    );
    const occupancy = Array.from({ length: 8 }, (_, week) => {
      const date = addDays(today, week * 7),
        end = addDays(date, 7);
      return occupancyOf(
        date,
        all.filter((r) => r.date >= date && r.date < end),
      );
    });
    return {
      hotels,
      alerts,
      occupancy,
      kpis: kpisOf(
        all.filter((r) => r.date < addDays(today, 30)),
        available,
        capacity,
      ),
    };
  };
}
