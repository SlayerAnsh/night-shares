import { fromTenths } from "@night-shares/market-model";
import { DomainError } from "../../../shared/errors/domain-error";
import { toWholeTenths } from "../../../shared/tenths";
export function quantity(tenths: number): number {
  if (!Number.isSafeInteger(tenths) || tenths < 0)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Quantity must be nonnegative integer tenths.",
    );
  return fromTenths(tenths);
}
export const clean = (rooms: number): number =>
  fromTenths(toWholeTenths(rooms));
