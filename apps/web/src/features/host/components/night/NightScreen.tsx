"use client";
import { buttonClass } from "@night-shares/design-system";
import Link from "next/link";
import { useNight, useProperty } from "../../hooks/use-host-data";
import { shortNight, todayIso } from "../../model/calendar";
import { Crumbs } from "../ui/Crumbs";
import { cx } from "../ui/cx";
import { Loading, StateCard } from "../ui/QueryState";
import ui from "../ui/ui.module.css";
import { ActivityTable } from "./ActivityTable";
import styles from "./Night.module.css";
import { NightHead } from "./NightHead";
import { NightPayout } from "./NightPayout";
import { ReleaseTimeline } from "./ReleaseTimeline";
import { RoomBlock } from "./RoomBlock";
import rooms from "./Rooms.module.css";

export function NightScreen({
  propertyId,
  date,
}: {
  propertyId: string;
  date: string;
}) {
  const query = useNight(propertyId, date);
  const property = useProperty(propertyId).data?.property;
  const hotel = property?.name ?? "Hotel";
  const names = new Map(
    property?.roomTypes.map((room) => [room.id, room.name]),
  );
  const edit = `/host/${propertyId}?month=${date.slice(0, 7)}&mode=picked&dates=${date}#open-nights`;
  const now = Date.now();
  const isPast = date < todayIso(now);
  const rows = query.data?.roomTypes ?? [];
  return (
    <>
      <Crumbs
        parts={[
          ["All hotels", "/host"],
          [hotel, `/host/${propertyId}`],
          [shortNight(date)],
        ]}
      />
      <NightHead propertyId={propertyId} date={date} rows={rows} now={now} />
      {query.isPending && (
        <Loading
          label="Loading night"
          rows={[
            [420, 300],
            [260, 300],
          ]}
        />
      )}
      {!query.isPending && !query.data && (
        <StateCard title="This night could not load" error={query.error}>
          Go back to the hotel calendar and pick the night again.
        </StateCard>
      )}
      {query.data && !rows.length && (
        <section className={cx(ui.card, styles.form)}>
          <div className={ui.lbl}>
            {isPast ? "Not offered" : "Not open yet"}
          </div>
          <h2>{isPast ? "This night was not offered" : "Open this night"}</h2>
          <p className={ui.note}>
            {isPast
              ? "Nights in the past cannot be opened."
              : "Pick room types, allotment and demand for this night on the hotel calendar."}
          </p>
          {!isPast && (
            <Link
              className={cx(buttonClass({ variant: "primary" }), styles.btn)}
              href={edit}
            >
              Open nights
            </Link>
          )}
        </section>
      )}
      {query.data && rows.length > 0 && (
        <div className={styles.grid}>
          <div className={styles.main}>
            <section
              className={cx(ui.card, styles.sec)}
              aria-labelledby="h-rooms"
            >
              <div className={styles.secH}>
                <h2 id="h-rooms">Rooms</h2>
                {!isPast && (
                  <Link
                    className={buttonClass({
                      variant: "secondary",
                      size: "sm",
                    })}
                    href={edit}
                  >
                    Edit rooms and demand
                  </Link>
                )}
              </div>
              {!isPast && (
                <p className={cx(ui.note, styles.lock)}>
                  This night is open. Payouts sweep to your wallet
                  automatically, and unsold rooms come back at release time.
                </p>
              )}
              <div className={rooms.list}>
                {rows.map((row) => (
                  <RoomBlock
                    key={row.night?.roomTypeId}
                    row={row}
                    name={
                      names.get(row.night?.roomTypeId ?? "") ??
                      row.night?.roomTypeId ??
                      ""
                    }
                    isPast={isPast}
                  />
                ))}
              </div>
            </section>
            <section
              className={cx(ui.card, styles.sec)}
              aria-labelledby="h-act"
            >
              <div className={styles.secH}>
                <h2 id="h-act">Market activity</h2>
              </div>
              <ActivityTable events={query.data.activity} />
            </section>
          </div>
          <aside className={styles.aside}>
            <section
              className={cx(ui.card, styles.sec)}
              aria-labelledby="h-pay"
            >
              <div className={styles.secH}>
                <h2 id="h-pay">Payout for this night</h2>
              </div>
              <NightPayout
                payout={query.data.payout}
                propertyId={propertyId}
                hotel={hotel}
              />
            </section>
            <section className={cx(ui.card, styles.sec)} aria-labelledby="h-tl">
              <div className={styles.secH}>
                <h2 id="h-tl">Release timeline</h2>
              </div>
              <ReleaseTimeline
                events={query.data.releaseTimeline}
                names={names}
                now={now}
              />
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
