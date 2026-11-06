"use client";
import { Photo } from "@night-shares/design-system";
import type { Alert, HotelSummary } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { useProperty } from "../../hooks/use-host-data";
import { usd } from "../../model/money";
import { validWalks, WALK_LIMIT } from "../../model/walks";
import { cx } from "../ui/cx";
import { SyncPill } from "../ui/SyncPill";
import ui from "../ui/ui.module.css";
import { DayStrip } from "./DayStrip";
import { NextBusyNight } from "./NextBusyNight";
import styles from "./Portfolio.module.css";

export function HotelCard({
  hotel,
  from,
  alerts,
}: {
  hotel: HotelSummary;
  from: string;
  alerts: Alert[];
}) {
  const property = useProperty(hotel.propertyId).data?.property;
  const walks = validWalks(hotel.walkIncidents).length;
  const alert = alerts[0];
  const kpis = hotel.kpis;
  return (
    <article className={cx(ui.card, styles.hk)}>
      <Photo src={property?.photos[0]} className={styles.photo} />
      <div className={styles.body}>
        <div className={styles.top}>
          <div className={styles.id}>
            <h3>
              <Link href={`/host/${hotel.propertyId}`}>{hotel.name}</Link>
            </h3>
            <span>
              {hotel.city}
              {property?.country ? `, ${property.country}` : ""}
              {property ? ` · ${property.roomTypes.length} room types` : ""}
            </span>
          </div>
          <SyncPill small>Connected</SyncPill>
        </div>
        <div className={styles.occ}>
          <b>{Math.round((kpis?.occupancyBps ?? 0) / 100)}%</b>
          <span>occupancy, next 30 nights</span>
        </div>
        {property && from && (
          <DayStrip
            propertyId={hotel.propertyId}
            roomTypeIds={property.roomTypes.map((room) => room.id)}
            from={from}
          />
        )}
        <dl className={styles.mini}>
          <div>
            <dt>Revenue, 30 nights</dt>
            <dd>{usd(kpis?.revenue?.micros)}</dd>
          </div>
          <div>
            <dt>Available now</dt>
            <dd>{usd(kpis?.availableNow?.micros)}</dd>
          </div>
          <div>
            <dt>Average rate</dt>
            <dd>{usd(kpis?.averageRate?.micros)}</dd>
          </div>
          <div>
            <dt>Next busy night</dt>
            <dd>
              {from ? (
                <NextBusyNight
                  propertyId={hotel.propertyId}
                  from={from}
                  month={from.slice(0, 7)}
                />
              ) : (
                "None soon"
              )}
            </dd>
          </div>
        </dl>
        <p className={cx(styles.walk, walks > 0 && styles.walkWarn)}>
          Guests turned away <b>{walks}</b>
          <span>{WALK_LIMIT} incidents stop new nights</span>
        </p>
        <p className={cx(styles.alert, !alert && styles.calm)}>
          {alert ? (
            <Link href={`/host/${alert.propertyId}/${alert.date}`}>
              {alert.message}
              {alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ""}
            </Link>
          ) : (
            "Nothing needs you right now"
          )}
        </p>
      </div>
    </article>
  );
}
