import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { PreviewOpenNightsResponse } from "@night-shares/proto/host/v1/host_pb";
import { formatRoomNights } from "../../../../shared/format";
import { usd } from "../../model/money";
import { previewByRoomType } from "../../model/preview";
import { WALK_LIMIT, WALK_RULE } from "../../model/walks";
import ui from "../ui/ui.module.css";
import styles from "./Results.module.css";

/** What opening the selection would price and pay, per room type. */
export function OpeningPreview({
  property,
  preview,
}: {
  property: Property;
  preview: PreviewOpenNightsResponse;
}) {
  const rows = previewByRoomType(preview.nights);
  const total = rows.reduce((sum, row) => sum + row.minimumPayout, 0n);
  const several = rows.some((row) => row.nights > 1);
  return (
    <div className={styles.results} aria-live="polite">
      <table>
        <caption className={ui.srOnly}>Prices by room type</caption>
        <thead>
          <tr>
            <th>Per room{several ? ", average" : ""}</th>
            <th>Never sells below</th>
            <th>Last room sells around</th>
            <th>Price cap for guests</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.roomTypeId}>
              <td>
                {property.roomTypes.find((room) => room.id === row.roomTypeId)
                  ?.name ?? row.roomTypeId}
                <div className={ui.muted}>
                  {formatRoomNights(row.allotment)} room nights
                </div>
              </td>
              <td>{usd(row.floor)}</td>
              <td>{usd(row.lastRoom)}</td>
              <td>{usd(row.cap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={ui.note}>
        Price goes up as rooms sell. While traders hold rooms, guests can still
        book at the price cap: the room is taken back from a trader at that
        price.
      </p>
      <div className={styles.list}>
        <div className={styles.total}>
          <span>You receive at least, if every offered room sells</span>
          <b>{usd(total)}</b>
        </div>
        <p className={ui.note}>
          Across {preview.slots} slots, {preview.kept} kept to cover rooms
          already booked or held. Paid out automatically in USDC.
        </p>
        <p className={ui.note}>
          Keep these rooms closed on your other channels. {WALK_RULE} Each one
          is a public incident, and {WALK_LIMIT} stop new nights.
        </p>
      </div>
    </div>
  );
}
