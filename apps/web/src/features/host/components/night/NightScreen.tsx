"use client";
import { formatRoomNights, formatUsdc } from "../../../../shared/format";
import { useNight, useProperty } from "../../hooks/use-host-data";
import { activityLabel, activityRows } from "../../model/activity";
import { formatInstant } from "../../model/host-view";
import { ErrorMessage, PayoutFacts } from "../shared/HostFacts";

export function NightScreen({
  propertyId,
  date,
}: {
  propertyId: string;
  date: string;
}) {
  const query = useNight(propertyId, date);
  const property = useProperty(propertyId);
  const edit = `/host/${propertyId}?month=${date.slice(0, 7)}&mode=picked&dates=${date}#open-nights`;
  return (
    <>
      <nav>
        <a href="/host">All hotels</a> /{" "}
        <a href={`/host/${propertyId}`}>
          {property.data?.property?.name ?? "Hotel"}
        </a>
      </nav>
      <h1>{date}</h1>
      <a href={edit}>Edit rooms and demand</a>
      {query.isPending && <p>Loading night…</p>}
      <ErrorMessage error={query.error ?? property.error} />
      {query.data && (
        <>
          <section>
            <h2>Rooms</h2>
            {!query.data.roomTypes.length && (
              <p>
                This night is not open yet. <a href={edit}>Open nights</a>
              </p>
            )}
            {query.data.roomTypes.map((row) => (
              <article key={row.night?.roomTypeId}>
                <h3>
                  {property.data?.property?.roomTypes.find(
                    (room) => room.id === row.night?.roomTypeId,
                  )?.name ?? row.night?.roomTypeId}
                </h3>
                <p>
                  {row.isStopped
                    ? "Stopped"
                    : (row.allotment?.tenths ?? 0) === 0
                      ? "Not open"
                      : (row.onSale?.tenths ?? 0) > 0
                        ? "Selling now"
                        : "Sold out"}
                </p>
                <dl>
                  <dt>Rooms offered</dt>
                  <dd>{formatRoomNights(row.allotment?.tenths ?? 0)}</dd>
                  <dt>Booked by guests</dt>
                  <dd>{formatRoomNights(row.booked?.tenths ?? 0)}</dd>
                  <dt>Held by traders</dt>
                  <dd>{formatRoomNights(row.held?.tenths ?? 0)}</dd>
                  <dt>Still on sale</dt>
                  <dd>{formatRoomNights(row.onSale?.tenths ?? 0)}</dd>
                  <dt>Usual rate</dt>
                  <dd>{formatUsdc(row.usualRate?.micros ?? 0n)}</dd>
                  <dt>Guest price</dt>
                  <dd>{formatUsdc(row.guestPrice?.micros ?? 0n)}</dd>
                  <dt>Demand</dt>
                  <dd>
                    {(
                      { 1: "Calm", 2: "Normal", 3: "Peak" } as Record<
                        number,
                        string
                      >
                    )[row.demandPreset] ?? "Not set"}
                  </dd>
                  <dt>Release time</dt>
                  <dd>{formatInstant(row.releaseAt)}</dd>
                </dl>
                <PayoutFacts value={row.payout} />
              </article>
            ))}
          </section>
          <section>
            <h2>Market activity</h2>
            {query.data.activity.length ? (
              <ul>
                {activityRows(query.data.activity).map((event) => (
                  <li key={event.key}>
                    {formatInstant(event.at)}: {activityLabel(event.kind)};{" "}
                    {formatRoomNights(event.tenths)} rooms;{" "}
                    {formatUsdc(event.micros)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No activity yet.</p>
            )}
          </section>
          <section>
            <h2>Release timeline</h2>
            <ol>
              {query.data.releaseTimeline.map((event) => (
                <li key={`${event.at?.seconds}:${event.description}`}>
                  {formatInstant(event.at)}: {event.description}
                </li>
              ))}
            </ol>
            {!query.data.releaseTimeline.length && <p>No release scheduled.</p>}
          </section>
          <section>
            <h2>Payout for this night</h2>
            <PayoutFacts value={query.data.payout} />
            <a href={`/host/payout?property=${propertyId}`}>Withdraw</a>
          </section>
        </>
      )}
    </>
  );
}
