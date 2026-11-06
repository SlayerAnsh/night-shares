import { create } from "@bufbuild/protobuf";
import {
  type NightKey,
  NightKeySchema,
} from "@night-shares/proto/common/v1/night_pb";
import { parseDate } from "./dates";
import { DomainError } from "./errors/domain-error";
export type NightIdentity = Pick<
  NightKey,
  "propertyId" | "roomTypeId" | "date"
>;
export function format(night: NightIdentity): string {
  parseDate(night.date);
  if (
    !night.propertyId ||
    !night.roomTypeId ||
    night.propertyId.includes(":") ||
    night.roomTypeId.includes(":")
  ) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "A night needs property and room type ids without colons.",
    );
  }
  return `${night.propertyId}:${night.roomTypeId}:${night.date}`;
}
export function parse(key: string): NightIdentity {
  const [propertyId, roomTypeId, date, extra] = key.split(":");
  if (!propertyId || !roomTypeId || !date || extra !== undefined)
    throw new DomainError("INVALID_ARGUMENT", "Invalid night key.");
  const night = { propertyId, roomTypeId, date };
  format(night);
  return night;
}
export const fromProto = (night: NightKey): string => format(night);
export const toProto = (key: string): NightKey =>
  create(NightKeySchema, parse(key));
