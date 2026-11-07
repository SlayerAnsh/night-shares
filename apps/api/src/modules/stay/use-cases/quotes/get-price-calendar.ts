import type { GetPriceCalendarRequest } from "@night-shares/proto/stay/v1/stay_pb";
import type { Ports } from "../../../../container/ports";
import { diffDays, range } from "../../../../shared/dates";
import { DomainError } from "../../../../shared/errors/domain-error";
import { calendarNight } from "../../pricing/calendar-night";
export function createGetPriceCalendar(ports: Ports) {
  return (input: GetPriceCalendarRequest) => {
    const count = diffDays(input.startDate, input.endDate);
    if (count < 1 || count > 365)
      throw new DomainError("INVALID_ARGUMENT", "Choose 1 to 365 nights.");
    const dates =
      ports.chainExecutor?.mode === "chain"
        ? ports.inventory
            .list({
              propertyId: input.propertyId,
              roomTypeId: input.roomTypeId,
            })
            .filter(
              (r) =>
                r.openedAt > 0 &&
                r.chainFingerprint === ports.chainReader?.fingerprint &&
                r.date >= input.startDate &&
                r.date < input.endDate,
            )
            .map((r) => r.date)
        : range(input.startDate, input.endDate);
    return dates.map((date) =>
      calendarNight(ports, input.propertyId, input.roomTypeId, date),
    );
  };
}
