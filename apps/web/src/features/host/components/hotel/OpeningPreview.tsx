import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { PreviewOpenNightsResponse } from "@night-shares/proto/host/v1/host_pb";
import { formatRoomNights, formatUsdc } from "../../../../shared/format";
export function OpeningPreview({
  property,
  preview,
}: {
  property: Property;
  preview: PreviewOpenNightsResponse;
}) {
  return (
    <div aria-live="polite">
      <h3>Preview</h3>
      <p>
        {preview.slots} slots; {preview.kept} kept to cover rooms already booked
        or held.
      </p>
      <table>
        <caption>Prices and payout by night and room type</caption>
        <thead>
          <tr>
            <th>Night</th>
            <th>Room type</th>
            <th>Rooms offered</th>
            <th>Never sells below</th>
            <th>Last room sells around</th>
            <th>Price cap for guests</th>
            <th>Minimum payout</th>
            <th>Security hold</th>
          </tr>
        </thead>
        <tbody>
          {preview.nights.map((row) => (
            <tr key={`${row.night?.date}:${row.night?.roomTypeId}`}>
              <th scope="row">{row.night?.date}</th>
              <td>
                {
                  property.roomTypes.find(
                    (room) => room.id === row.night?.roomTypeId,
                  )?.name
                }
              </td>
              <td>{formatRoomNights(row.allotment?.tenths ?? 0)}</td>
              <td>{formatUsdc(row.floor?.micros ?? 0n)}</td>
              <td>{formatUsdc(row.lastRoomPrice?.micros ?? 0n)}</td>
              <td>{formatUsdc(row.guestPriceCap?.micros ?? 0n)}</td>
              <td>{formatUsdc(row.minimumPayout?.micros ?? 0n)}</td>
              <td>{formatUsdc(row.securityHold?.micros ?? 0n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
