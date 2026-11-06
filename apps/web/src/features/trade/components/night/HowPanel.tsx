import type {
  GetBookResponse,
  GetNightResponse,
} from "@night-shares/proto/market/v1/market_pb";
import { usd } from "../../model/display";
import { percent } from "../../model/market";
import styles from "./tabs.module.css";

// Five steps from buying to release, with this market's numbers.
export function HowPanel({
  detail,
  book,
}: {
  detail?: GetNightResponse;
  book?: GetBookResponse;
}) {
  const price = detail?.night?.price?.micros;
  const fair = book?.fairPrice?.micros ?? detail?.night?.fairPrice?.micros;
  return (
    <>
      <p className={styles.line}>
        Five steps from buying to release, with this market&apos;s numbers.
      </p>
      <ol className={styles.how}>
        <li>
          <b>Buy room nights at about {usd(price)} each.</b> A fee is added; the
          order box shows the exact total before you trade.
        </li>
        <li>
          <b>The price moves as guests book and traders trade.</b> The predicted
          fair price is {usd(fair)} now.
        </li>
        <li>
          <b>
            Sell back to the hotel&apos;s pool any time, or list it at your
            price.
          </b>{" "}
          Near release a late fee applies
          {book?.lateFeeBps ? `, now ${percent(book.lateFeeBps)}` : ""}.
        </li>
        <li>
          <b>A guest who books takes the cheapest offer.</b> When nothing else
          is left, a guest can take a held room night at the price cap of{" "}
          {usd(book?.recallCap?.micros)}, largest holder first.
        </li>
        <li>
          <b>
            If unsold at release, every room night you hold gets 70% of the
            pool&apos;s bid back
          </b>
          , about {usd(detail?.stats?.worstRefund?.micros)} each today.
        </li>
      </ol>
      <p className={styles.limit}>
        Each human may hold up to 30% of this night, checked with World ID, so
        no one can corner it. You and your agents share one limit.
      </p>
    </>
  );
}
