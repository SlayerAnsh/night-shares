import { DomainError } from "../../../shared/errors/domain-error";
import type { NightRecord } from "../inventory-repo";
import { clean, quantity } from "./quantity";
// Ownership changes outside inventory. Total holdings and pool position stay constant.
export function applyTraderAskFill(
  record: NightRecord,
  askIndex: number,
  tenths: number,
): NightRecord {
  const size = quantity(tenths);
  const ask = record.state.traderAsks[askIndex];
  if (!ask || size > ask.size)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Ask fill exceeds the available listing.",
    );
  const traderAsks = record.state.traderAsks.flatMap((a, i) => {
    if (i !== askIndex) return [{ ...a }];
    const remaining = clean(a.size - size);
    return remaining > 0 ? [{ ...a, size: remaining }] : [];
  });
  return { ...record, state: { ...record.state, traderAsks } };
}
