import { EmptyState } from "@night-shares/design-system";
import type { Ask } from "@night-shares/proto/market/v1/book_pb";
import type { Holding } from "@night-shares/proto/market/v1/portfolio_pb";
import { nightHref } from "../../model/market";
import { Section } from "../ui/Section";
import { HoldingRow } from "./HoldingRow";
import styles from "./portfolio.module.css";

const HEAD = [
  "Market",
  "Held",
  "Avg cost / rn",
  "Value",
  "P&L",
  "Est. return",
  "Risk",
  "Listed",
  "Refund if unsold",
];

// Nights you hold yourself, valued at the fair price. One row per market.
export function Positions({
  holdings,
  listings,
}: {
  holdings: Holding[];
  listings: Ask[];
}) {
  return (
    <Section
      id="h-pos"
      title="Positions"
      line={`${holdings.length} ${holdings.length === 1 ? "night" : "nights"} you hold yourself, valued at the predicted fair price. If unsold at cutoff each room night gets 70% of the average bid back.`}
    >
      {holdings.length ? (
        <div>
          <div className={styles.head}>
            {HEAD.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          {holdings.map((h) => (
            <HoldingRow
              key={h.night ? nightHref(h.night) : "unknown"}
              holding={h}
              listings={listings}
            />
          ))}
        </div>
      ) : (
        <EmptyState plain>No positions yet. Pick a market and buy.</EmptyState>
      )}
    </Section>
  );
}
