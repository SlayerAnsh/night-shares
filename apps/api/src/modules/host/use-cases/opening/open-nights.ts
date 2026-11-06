import { floorFromRate, toTenths } from "@night-shares/market-model";
import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import { editAllotment } from "../../../inventory/mutations/edit-allotment";
import { openAllotment } from "../../../inventory/mutations/open-allotment";
import { mapNight } from "../../mappers/night";
import type { HostDeps } from "../deps";
import { selectNights } from "./selection";
export function createOpenNights(deps: HostDeps) {
  return (userId: string, selection?: OpenNightsSelection) => {
    const plans = selectNights(deps, userId, selection);
    return plans.map(({ record, preset, tenths, releasePolicy }) => {
      let edited = false;
      const updated = deps.ports.inventory.update(record.key, (current) => {
        edited = !current.stopped && current.state.S > 0;
        const edit = {
          tenths: Math.max(
            tenths,
            toTenths(current.state.booked + current.state.held),
          ),
          preset,
          floor: floorFromRate(current.state.usualRate),
        };
        return edited
          ? editAllotment(current, edit)
          : openAllotment(current, edit, deps.ports.clock.now());
      });
      deps.repo.setRelease(record.key, releasePolicy);
      deps.ports.activity.append({
        nightKey: record.key,
        propertyId: record.propertyId,
        kind: edited ? "nights_edited" : "nights_opened",
        tenths: toTenths(updated.state.S),
        actor: "host",
        userId,
      });
      return mapNight(updated, deps.repo);
    });
  };
}
