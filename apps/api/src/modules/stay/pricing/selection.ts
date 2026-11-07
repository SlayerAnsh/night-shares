import { create } from "@bufbuild/protobuf";
import {
  type StaySelection,
  StaySelectionSchema,
} from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../container/ports";
import { diffDays, range } from "../../../shared/dates";
import { DomainError } from "../../../shared/errors/domain-error";
export function selection(ports: Ports, input: StaySelection | undefined) {
  if (!input) throw new DomainError("INVALID_ARGUMENT", "Choose a stay.");
  const value = create(StaySelectionSchema, {
    ...input,
    adults: input.adults || 2,
    rooms: input.rooms || 1,
  });
  if (!ports.catalog.getRoomType(value.propertyId, value.roomTypeId))
    throw new DomainError("NOT_FOUND", "Property or room type not found.");
  const count = diffDays(value.checkIn, value.checkOut);
  if (count < 1 || count > 365 || value.checkIn < ports.clock.today())
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Choose future dates for 1 to 365 nights.",
    );
  if (
    value.adults < 1 ||
    value.adults > 12 ||
    value.kids < 0 ||
    value.kids > 8 ||
    value.rooms < 1 ||
    value.rooms > 4
  )
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Choose valid guest and room counts.",
    );
  if (
    (ports.chainExecutor?.mode === "fork" ||
      process.env.ARC_NETWORK === "mainnet") &&
    (value.rooms !== 1 || count !== 1)
  )
    throw new DomainError(
      "INVALID_ARGUMENT",
      "On-chain bookings support exactly 1 room for 1 night. Choose a single room and night.",
    );
  return { value, dates: range(value.checkIn, value.checkOut) };
}
