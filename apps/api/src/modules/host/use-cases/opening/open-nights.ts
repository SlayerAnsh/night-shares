import {
  floorFromRate,
  toTenths,
  WALK_SUSPEND_AFTER,
} from "@night-shares/market-model";
import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import { DomainError } from "../../../../shared/errors/domain-error";
import { editAllotment } from "../../../inventory/mutations/edit-allotment";
import { openAllotment } from "../../../inventory/mutations/open-allotment";
import { walkIncidents } from "../../../walk/repo/incidents";
import { mapNight } from "../../mappers/night";
import type { HostDeps } from "../deps";
import { pushChange } from "./push-change";
import { selectNights } from "./selection";

const NIGHT_VAULT = "night_vault";

export function createOpenNights(deps: HostDeps) {
  return (userId: string, selection?: OpenNightsSelection) => {
    const plans = selectNights(deps, userId, selection);
    if (
      plans.some(
        ({ record }) =>
          walkIncidents(deps.ports.db, record.propertyId).filter(
            (incident) => !incident.isFalse,
          ).length >= WALK_SUSPEND_AFTER,
      )
    )
      throw new DomainError(
        "FAILED_PRECONDITION",
        "New openings are suspended after repeated walked guests.",
      );
    return pushChange(
      deps,
      plans.map(({ record }) => record.key),
      userId,
      (publish) =>
        plans.map(({ record, preset, tenths, releasePolicy }) => {
          let edited = false;
          const updated = deps.ports.inventory.update(record.key, (current) => {
            edited = current.openedAt > 0;
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
          publish.push(() => {
            deps.ports.db
              .query(
                "INSERT OR IGNORE INTO host_pool_positions VALUES (?, ?, ?)",
              )
              .run(record.key, NIGHT_VAULT, toTenths(updated.state.S));
          });
          deps.repo.setRelease(record.key, releasePolicy);
          publish.push(() =>
            deps.ports.activity.append({
              nightKey: record.key,
              propertyId: record.propertyId,
              kind: edited ? "nights_edited" : "nights_opened",
              tenths: toTenths(updated.state.S),
              actor: "host",
              userId,
            }),
          );
          return mapNight(updated, deps.repo);
        }),
    );
  };
}
