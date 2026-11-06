"use client";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { formatRoomNights } from "../../../../shared/format";
import { useAccount } from "../../hooks/use-account";
import { usd } from "../../model/display";
import { nightHref } from "../../model/market";
import styles from "./ticket.module.css";

// Your own holding and listings on this market, under the order box.
export function TicketPosition({
  night,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
}) {
  const { portfolio } = useAccount();
  const key = nightHref(night);
  const same = (other?: Pick<NightKey, "propertyId" | "roomTypeId" | "date">) =>
    !!other && nightHref(other) === key;
  const holding = portfolio.data?.holdings.find((h) => same(h.night));
  const listed =
    portfolio.data?.listings.filter((ask) => same(ask.night)) ?? [];
  if (!holding && !listed.length) return null;
  return (
    <p className={styles.pos}>
      You hold <b>{formatRoomNights(holding?.size?.tenths ?? 0)}</b> room nights
      {holding && <> at {usd(holding.averageCost?.micros)} average</>}
      {listed.length > 0 && (
        <>
          , {listed.length} {listed.length === 1 ? "listing" : "listings"} open
        </>
      )}
      .
    </p>
  );
}
