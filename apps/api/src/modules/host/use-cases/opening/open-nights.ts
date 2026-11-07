import {
  floorFromRate,
  PRESETS,
  WALK_SUSPEND_AFTER,
} from "@night-shares/market-model";
import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import {
  assertTrading,
  chainLimits,
} from "../../../../ports/chain-status/chain-status";
import { DomainError } from "../../../../shared/errors/domain-error";
import { toWholeTenths } from "../../../../shared/tenths";
import { editAllotment } from "../../../inventory/mutations/edit-allotment";
import { openAllotment } from "../../../inventory/mutations/open-allotment";
import { walkIncidents } from "../../../walk/repo/incidents";
import { openChainNights } from "../../chain/open";
import { assertChainPrices } from "../../chain-limits";
import { mapNight } from "../../mappers/night";
import { assertMaxSupply } from "../../max-s";
import { assertOpenNightLimit } from "../../open-night-limit";
import type { HostDeps } from "../deps";
import { pushChange } from "./push-change";
import { selectNights } from "./selection";

const NIGHT_VAULT = "night_vault";

export function createOpenNights(deps: HostDeps) {
  return (userId: string, selection?: OpenNightsSelection) => {
    assertTrading(deps.ports);
    const plans = selectNights(deps, userId, selection);
    if (deps.ports.chainExecutor?.mode === "chain")
      return openChainNights(deps, userId, plans);
    for (const { record } of plans) assertTrading(deps.ports, record.key);
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
      (publish) => {
        if (chainLimits(deps.ports))
          assertOpenNightLimit(
            deps.ports,
            plans.map(({ record }) => record.key),
          );
        return plans.map(({ record, preset, tenths, releasePolicy }) => {
          let edited = false;
          const updated = deps.ports.inventory.update(record.key, (current) => {
            edited = current.openedAt > 0;
            const edit = {
              tenths: Math.max(
                tenths,
                toWholeTenths(current.state.booked + current.state.held),
              ),
              preset,
              floor: chainLimits(deps.ports)
                ? current.state.F
                : floorFromRate(current.state.usualRate),
            };
            assertMaxSupply(edit.tenths);
            if (chainLimits(deps.ports))
              assertChainPrices({
                F: edit.floor,
                k: PRESETS[preset],
                S: edit.tenths / 10,
              });
            const next = edited
              ? editAllotment(current, edit)
              : openAllotment(current, edit, deps.ports.clock.now());
            if (chainLimits(deps.ports)) assertChainPrices(next.state);
            return next;
          });
          publish.push(() => {
            deps.ports.db
              .query(
                "INSERT OR IGNORE INTO host_pool_positions VALUES (?, ?, ?)",
              )
              .run(record.key, NIGHT_VAULT, toWholeTenths(updated.state.S));
          });
          deps.repo.setRelease(record.key, releasePolicy);
          publish.push(() =>
            deps.ports.activity.append({
              nightKey: record.key,
              propertyId: record.propertyId,
              kind: edited ? "nights_edited" : "nights_opened",
              tenths: toWholeTenths(updated.state.S),
              actor: "host",
              userId,
            }),
          );
          return mapNight(updated, deps.repo);
        });
      },
    );
  };
}
