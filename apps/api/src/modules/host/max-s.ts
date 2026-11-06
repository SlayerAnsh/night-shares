import { DomainError } from "../../shared/errors/domain-error";
import { toWholeTenths } from "../../shared/tenths";

export const MAX_S = 100;

export function assertMaxSupply(tenths: number) {
  if (tenths > toWholeTenths(MAX_S))
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Allotment cannot exceed 100 rooms per night and room type.",
    );
}
