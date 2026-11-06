import type { GetBookResponse } from "@night-shares/proto/market/v1/market_pb";
import { formatRoomNights } from "../../../../shared/format";
import { Empty } from "../ui/Empty";
import { Skeleton } from "../ui/Skeleton";
import text from "../ui/text.module.css";
import styles from "./holders.module.css";
import tabs from "./tabs.module.css";

// Public holders of this night. Wallets only, no names.
export function HoldersPanel({ book }: { book?: GetBookResponse }) {
  if (!book) return <Skeleton rows={4} label="Loading holders" />;
  return (
    <>
      <p className={tabs.line}>
        Each human may hold up to 30% of this night. Guests can recall holdings
        at the recall cap, largest holder first.
      </p>
      {book.holders.length ? (
        <ul className={styles.list}>
          {book.holders.map((holder) => (
            <li key={holder.walletAddress}>
              <span className={text.mono}>{holder.walletAddress}</span>
              {holder.isHost && <span className={styles.host}>Host</span>}
              <b className={text.num}>
                {formatRoomNights(holder.size?.tenths ?? 0)} rn
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No one holds this night yet.</Empty>
      )}
    </>
  );
}
