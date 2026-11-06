import type { OpenNightsSelection } from "@night-shares/proto/host/v1/opening_pb";
import { diffDays } from "../../../../shared/dates";
import { DomainError } from "../../../../shared/errors/domain-error";
import { format } from "../../../../shared/night-key";
import { toWholeTenths } from "../../../../shared/tenths";
import { assertMaxSupply } from "../../max-s";
import type { HostDeps } from "../deps";
import { propertyOf } from "../property";
export function selectNights(
  deps: HostDeps,
  userId: string,
  selection?: OpenNightsSelection,
) {
  if (!selection)
    throw new DomainError("INVALID_ARGUMENT", "Select nights to open.");
  const p = propertyOf(deps, userId, selection.propertyId);
  const preset = ({ 1: "calm", 2: "normal", 3: "peak" } as const)[
    selection.demandPreset as 1 | 2 | 3
  ];
  if (!preset || ![1, 2, 3].includes(selection.releasePolicy))
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Choose demand and release settings.",
    );
  const pct = selection.allotmentPercent;
  if (!Number.isInteger(pct) || pct < 10 || pct > 100 || pct % 10)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Allotment must be 10 to 100 percent in steps of 10.",
    );
  const dates = [...new Set(selection.dates)];
  const types = [...new Set(selection.roomTypeIds)];
  if (!dates.length || !types.length || dates.length > 240)
    throw new DomainError("INVALID_ARGUMENT", "Select dates and room types.");
  for (const date of dates) {
    const days = diffDays(deps.ports.clock.today(), date);
    if (days < 0 || days >= 240)
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Choose nights within the next 240 days.",
      );
  }
  return types.flatMap((roomTypeId) => {
    const index = p.roomTypes.findIndex((r) => r.id === roomTypeId);
    if (index < 0) throw new DomainError("NOT_FOUND", "Room type not found.");
    const rooms =
      Math.floor(p.rooms / p.roomTypes.length) +
      (index < p.rooms % p.roomTypes.length ? 1 : 0);
    const requested = Math.max(1, Math.round((rooms * pct) / 100));
    return dates.map((date) => {
      const key = format({ propertyId: p.id, roomTypeId, date });
      const record = deps.ports.inventory.get(key);
      assertMaxSupply(
        Math.max(
          toWholeTenths(requested),
          toWholeTenths(record.state.booked + record.state.held),
        ),
      );
      return {
        record,
        kept: record.state.booked + record.state.held > requested,
        preset,
        tenths: Math.max(
          toWholeTenths(requested),
          toWholeTenths(record.state.booked + record.state.held),
        ),
        releasePolicy: selection.releasePolicy,
      };
    });
  });
}
