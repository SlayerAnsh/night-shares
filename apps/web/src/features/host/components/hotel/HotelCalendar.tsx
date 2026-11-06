import type { HostNight } from "@night-shares/proto/host/v1/hotel_pb";
import { formatRoomNights } from "../../../../shared/format";
import { aggregateDays } from "../../model/host-view";

export function HotelCalendar({
  nights,
  propertyId,
  selected,
  toggle,
  disabled,
}: {
  nights: HostNight[];
  propertyId: string;
  selected: string[];
  toggle: (date: string) => void;
  disabled: boolean;
}) {
  const days = aggregateDays(nights);
  return (
    <table>
      <caption>Night calendar</caption>
      <thead>
        <tr>
          <th>Select</th>
          <th>Night</th>
          <th>Rooms offered</th>
          <th>Booked</th>
          <th>Held by traders</th>
          <th>On sale</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date}>
            <td>
              <input
                type="checkbox"
                aria-label={`Select ${day.date}`}
                checked={selected.includes(day.date)}
                disabled={disabled}
                onChange={() => toggle(day.date)}
              />
            </td>
            <th scope="row">
              <a href={`/host/${propertyId}/${day.date}`}>{day.date}</a>
            </th>
            <td>{formatRoomNights(day.allotment)}</td>
            <td>{formatRoomNights(day.booked)}</td>
            <td>{formatRoomNights(day.held)}</td>
            <td>{formatRoomNights(day.onSale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
