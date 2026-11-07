import type { GetNightResponse } from "@night-shares/proto/market/v1/market_pb";
import type { ReactNode } from "react";
import { formatRoomNights } from "../../../../shared/format";
import { signedPercent, tone, usd } from "../../model/display";
import { percent } from "../../model/market";
import { Feedback } from "../shared/Feedback";
import { Risk } from "../shared/Risk";
import { Skeleton } from "../ui/Skeleton";
import text from "../ui/text.module.css";
import styles from "./tabs.module.css";

type Row = [string, ReactNode, string?];

function Column({
  title,
  figure,
  line,
  rows,
}: {
  title: string;
  figure: ReactNode;
  line: string;
  rows: Row[];
}) {
  return (
    <div className={styles.w4}>
      <h3>{title}</h3>
      <p className={`${styles.fig} ${text.fig}`}>{figure}</p>
      <p className={styles.short}>{line}</p>
      <dl className={styles.kvs}>
        {rows.map(([key, value, cls]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd className={`${text.num} ${cls ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// What the estimate rests on: return, risk, the hotel's record, liquidity.
export function WhyPanel({ detail }: { detail?: GetNightResponse }) {
  if (!detail) return <Skeleton rows={4} label="Loading the numbers" />;
  const s = detail.stats;
  const t = detail.hostTrackRecord;
  const ret = detail.night?.estimatedReturnBps ?? 0;
  const forecast =
    !!s?.expectedExit && (detail.night?.price?.micros ?? 0n) >= 10000n;
  return (
    <>
      <p className={styles.line}>
        What the estimate is based on: return, risk, this hotel&apos;s record
        and liquidity.
      </p>
      {s?.hostSoldBack && (
        <Feedback error="The host has sold holdings back on this night." />
      )}
      <div className={styles.why}>
        <Column
          title="Return"
          figure={
            <span className={text[tone(ret)]}>
              {signedPercent(forecast ? ret : undefined)}
            </span>
          }
          line="Expected if you hold to release, after fees."
          rows={[
            ["Value at release", usd(s?.expectedExit?.micros)],
            [
              "Sell through, similar nights",
              percent(forecast ? s?.sellThroughBps : undefined),
            ],
            [
              "Annualized",
              percent(forecast ? s?.annualizedReturnBps : undefined),
              text.muted,
            ],
          ]}
        />
        <Column
          title="Risk"
          figure={<Risk risk={detail.night?.risk ?? 0} size="large" />}
          line={`Prices moved ${percent(detail.priceHistory.length ? s?.volatilityBps : undefined)} recently.`}
          rows={[
            ["Refund if unsold", `${usd(s?.worstRefund?.micros)} / rn`],
            [
              "Price swings",
              percent(
                detail.priceHistory.length ? s?.volatilityBps : undefined,
              ),
            ],
            [
              "Host sold back",
              detail.night?.fairPrice
                ? s?.hostSoldBack
                  ? "Yes"
                  : "No"
                : "n/a",
            ],
          ]}
        />
        <Column
          title="Track record"
          figure={percent(t?.profitableBps).replace(".00", "")}
          line="of traders made money on past nights at this hotel."
          rows={[
            [
              "Avg return per night",
              signedPercent(t?.averageReturnBps),
              text[tone(t?.averageReturnBps ?? 0)],
            ],
            ["Booked by guests", percent(t?.bookedBps)],
            ["Unsold at release", percent(t?.unsoldBps)],
            [
              "Guests turned away",
              t ? String(t.incidents) : "n/a",
              t?.incidents ? text.warn : undefined,
            ],
          ]}
        />
        <Column
          title="Liquidity"
          figure={`${formatRoomNights(s?.buyLiquidity?.tenths ?? 0)} rn`}
          line="Room nights available to buy now."
          rows={[
            [
              "Sell liquidity",
              `${formatRoomNights(s?.sellLiquidity?.tenths ?? 0)} rn`,
            ],
            ["Nights traded", t ? String(t.nightsTraded) : "n/a"],
            ["Bookings honoured", percent(t?.honouredBps)],
            ["Refunded at release", percent(t?.refundBps)],
          ]}
        />
      </div>
    </>
  );
}
