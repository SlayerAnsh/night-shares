import type { TraderTrackRecord } from "@night-shares/proto/market/v1/portfolio_pb";
import { signedPercent, signedUsd, tone } from "../../model/display";
import { percent } from "../../model/market";
import { Section } from "../ui/Section";
import text from "../ui/text.module.css";
import styles from "./portfolio.module.css";

// Trades you have closed, by selling back or a listing that filled.
export function TrackRecord({ record }: { record: TraderTrackRecord }) {
  const realised = record.realisedPnl?.micros ?? 0n;
  const rows: [string, string, string?][] = [
    ["Closed trades", String(record.closedPositions)],
    [
      "Win rate",
      record.closedPositions ? percent(record.profitableBps) : "n/a",
    ],
    [
      "Avg return per trade",
      signedPercent(record.averageReturnBps),
      text[tone(record.averageReturnBps)],
    ],
    ["Realised P&L", signedUsd(realised), text[tone(realised, 500000)]],
  ];
  return (
    <Section
      id="h-tr"
      title="Your track record"
      line="Trades you have closed, by selling back or a listing that filled."
    >
      <dl className={styles.kvs4}>
        {rows.map(([key, value, cls]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd className={`${text.fig} ${cls ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
