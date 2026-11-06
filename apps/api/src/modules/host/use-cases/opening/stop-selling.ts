import { toTenths } from "@night-shares/market-model";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { diffDays } from "../../../../shared/dates";
import { DomainError } from "../../../../shared/errors/domain-error";
import { format } from "../../../../shared/night-key";
import { stop } from "../../../inventory/mutations/stop";
import { mapNight } from "../../mappers/night";
import type { HostDeps } from "../deps";
import { propertyOf } from "../property";
export function createStopSelling(deps: HostDeps) {
  return (userId: string, nights: NightKey[]) => {
    if (!nights.length || nights.length > 480)
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Select nights to stop selling.",
      );
    const keys = [
      ...new Set(
        nights.map((night) => {
          propertyOf(deps, userId, night.propertyId);
          if (diffDays(deps.ports.clock.today(), night.date) < 0)
            throw new DomainError(
              "INVALID_ARGUMENT",
              "Past nights cannot be changed.",
            );
          const key = format(night);
          deps.ports.inventory.get(key);
          return key;
        }),
      ),
    ];
    return keys.map((key) => {
      let taken = 0,
        changed = false;
      const updated = deps.ports.inventory.update(key, (current) => {
        changed = !current.stopped;
        taken = current.stopped
          ? 0
          : Math.max(
              0,
              toTenths(
                current.state.S - current.state.booked - current.state.held,
              ),
            );
        return stop(current);
      });
      if (changed)
        deps.ports.activity.append({
          nightKey: key,
          propertyId: updated.propertyId,
          kind: "selling_stopped",
          tenths: taken,
          actor: "host",
          userId,
        });
      return mapNight(updated, deps.repo);
    });
  };
}
