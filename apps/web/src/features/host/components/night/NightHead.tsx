import { Badge, buttonClass } from "@night-shares/design-system";
import type { HostNight } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import {
  addDays,
  countdown,
  instantMs,
  isHoliday,
  shortInstant,
  shortNight,
} from "../../model/calendar";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import page from "../ui/Page.module.css";
import ui from "../ui/ui.module.css";
import styles from "./Night.module.css";
import { DEMAND, tradeHref } from "./RoomBlock";

export function NightHead({
  propertyId,
  date,
  rows,
  now,
}: {
  propertyId: string;
  date: string;
  rows: HostNight[];
  now: number;
}) {
  const offered = rows.reduce((n, r) => n + (r.allotment?.tenths ?? 0), 0);
  const booked = rows.reduce((n, r) => n + (r.booked?.tenths ?? 0), 0);
  const demand = [
    ...new Set(rows.map((r) => DEMAND[r.demandPreset]).filter(Boolean)),
  ];
  const release = rows
    .flatMap((r) => (r.releaseAt ? [r.releaseAt] : []))
    .sort((a, b) => instantMs(a) - instantMs(b))[0];
  const left = release && countdown(release, now);
  const nav = (step: -1 | 1) => (
    <Link
      className={ui.ib}
      href={`/host/${propertyId}/${addDays(date, step)}`}
      aria-label={`${step < 0 ? "Previous" : "Next"} night, ${shortNight(addDays(date, step))}`}
    >
      <Icon name={step < 0 ? "left" : "right"} />
    </Link>
  );
  return (
    <div className={cx(page.vHead, styles.head)}>
      <div>
        <div className={styles.row}>
          {nav(-1)}
          <h1 className={ui.display}>{shortNight(date)}</h1>
          {nav(1)}
        </div>
        <div className={styles.badges}>
          {isHoliday(date) && <Badge className={ui.badgeWarn}>Holiday</Badge>}
          {rows.length ? (
            <>
              {demand.length > 0 && <Badge>{demand.join(", ")} demand</Badge>}
              <Badge>
                {formatRoomNights(booked)} of {formatRoomNights(offered)}{" "}
                offered rooms booked
              </Badge>
            </>
          ) : (
            <Badge>Not open</Badge>
          )}
        </div>
      </div>
      <div className={styles.side}>
        {release && (
          <div className={styles.cdown}>
            <span className={ui.lbl}>
              {left ? "Unsold rooms come back" : "Released"}
            </span>
            <b>{left ?? shortInstant(release)}</b>
            <span>
              {left
                ? shortInstant(release)
                : "Unsold rooms went back to your inventory"}
            </span>
          </div>
        )}
        {rows[0] && (
          <Link className={buttonClass()} href={tradeHref(rows[0])}>
            See trading for this night <Icon name="right" />
          </Link>
        )}
      </div>
    </div>
  );
}
