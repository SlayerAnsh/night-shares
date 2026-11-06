import { create } from "@bufbuild/protobuf";
import type { SearchStaysRequest } from "@night-shares/proto/catalog/v1/catalog_pb";
import { StaySelectionSchema } from "@night-shares/proto/stay/v1/trip_pb";
import type { Ports } from "../../../container/ports";
import { addDays } from "../../../shared/dates";
import { DomainError } from "../../../shared/errors/domain-error";
import { quoteNight } from "../../stay/pricing/quote-night";
import { selection } from "../../stay/pricing/selection";
import { propertyToProto } from "../mappers/property";
export function createSearchStays(ports: Ports) {
  return (input: SearchStaysRequest) => {
    const query = input.destination.toLowerCase();
    const stays = ports.catalog
      .list()
      .filter(
        (p) =>
          (!input.type || input.type === "All" || p.type === input.type) &&
          `${p.name} ${p.city} ${p.country}`.toLowerCase().includes(query),
      )
      .flatMap((p) => {
        const roomTypeId = p.roomTypes[0]?.id;
        if (!roomTypeId) return [];
        try {
          const dated = !!(input.checkIn || input.checkOut);
          const { value, dates } = dated
            ? selection(
                ports,
                create(StaySelectionSchema, {
                  ...input,
                  $typeName: undefined,
                  propertyId: p.id,
                  roomTypeId,
                }),
              )
            : {
                value: { rooms: 1 },
                dates: Array.from({ length: 30 }, (_, i) =>
                  addDays(ports.clock.today(), i + 3),
                ),
              };
          const nights = dates.flatMap((date) => {
            try {
              return [quoteNight(ports, p.id, roomTypeId, date, value.rooms)];
            } catch (e) {
              if (
                !dated &&
                e instanceof DomainError &&
                e.code === "FAILED_PRECONDITION"
              )
                return [];
              throw e;
            }
          });
          if (!nights.length) return [];
          const total = dated
            ? nights.reduce((s, n) => s + n.price.micros, 0n)
            : 0n;
          const average = dated
            ? total / BigInt(dates.length * value.rooms)
            : nights.reduce((s, n) => {
                if (n.price.micros < s) return n.price.micros;
                return s;
              }, nights[0]?.price.micros ?? 0n);
          const usual = nights.reduce((s, n) => s + n.usualRate.micros, 0n);
          return [
            {
              property: propertyToProto(p),
              total: { micros: total },
              average: { micros: average },
              isDeal: dated && total * 100n < usual * 95n,
            },
          ];
        } catch (e) {
          if (e instanceof DomainError && e.code === "FAILED_PRECONDITION")
            return [];
          throw e;
        }
      });
    if (input.sort === "rate")
      stays.sort((a, b) => b.property.rating - a.property.rating);
    if (input.sort === "lo" || input.sort === "hi")
      stays.sort(
        (a, b) =>
          (a.average.micros < b.average.micros
            ? -1
            : a.average.micros > b.average.micros
              ? 1
              : 0) * (input.sort === "hi" ? -1 : 1),
      );
    return stays;
  };
}
