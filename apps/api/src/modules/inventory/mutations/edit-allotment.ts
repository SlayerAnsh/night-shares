import { capOf, PRESETS, trancheOf } from "@night-shares/market-model";
import { DomainError } from "../../../shared/errors/domain-error";
import type { NightRecord } from "../inventory-repo";
import { quantity } from "./quantity";
export type AllotmentEdit = {
  tenths: number;
  preset: keyof typeof PRESETS;
  floor?: number;
};
export function editAllotment(
  record: NightRecord,
  edit: AllotmentEdit,
): NightRecord {
  if (record.released)
    throw new DomainError("FAILED_PRECONDITION", "This night has closed.");
  const S = quantity(edit.tenths);
  const { booked, held } = record.state;
  if (S < booked + held - 1e-9)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Allotment cannot be less than booked plus held.",
    );
  const peak = edit.preset === "peak";
  return {
    ...record,
    state: {
      ...record.state,
      S,
      preset: edit.preset,
      peak,
      k: PRESETS[edit.preset],
      F: edit.floor ?? record.state.F,
      tranche: trancheOf(S),
      cap: capOf(S, peak),
    },
  };
}
