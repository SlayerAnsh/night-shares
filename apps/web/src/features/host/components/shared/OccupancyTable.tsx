import type { Occupancy } from "@night-shares/proto/host/v1/hotel_pb";
import { formatRoomNights } from "../../../../shared/format";
import { occupancyPercent } from "../../model/host-view";

export function OccupancyTable({
  rows,
  caption,
}: {
  rows: Occupancy[];
  caption: string;
}) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>Date</th>
          <th>Rooms offered</th>
          <th>Booked</th>
          <th>Held by traders</th>
          <th>On sale</th>
          <th>Booked / offered</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.date}>
            <th scope="row">{row.date}</th>
            <td>{formatRoomNights(row.allotment?.tenths ?? 0)}</td>
            <td>{formatRoomNights(row.booked?.tenths ?? 0)}</td>
            <td>{formatRoomNights(row.held?.tenths ?? 0)}</td>
            <td>{formatRoomNights(row.onSale?.tenths ?? 0)}</td>
            <td>{occupancyPercent(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
