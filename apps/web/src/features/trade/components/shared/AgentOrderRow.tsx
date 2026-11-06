import { Button } from "@night-shares/design-system";
import type { AgentOrder } from "@night-shares/proto/market/v1/portfolio_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { shortDate, usd } from "../../model/display";
import { nightHref } from "../../model/market";
import text from "../ui/text.module.css";
import styles from "./lists.module.css";

const STATUS = ["Unknown", "Waiting for approval", "Approved", "Executed"];
const PILL = ["", styles.pillPending, styles.pill, styles.pillDone];

export function AgentOrderRow({
  order,
  canApprove,
  onApprove,
}: {
  order: AgentOrder;
  canApprove: boolean;
  onApprove: () => void;
}) {
  const budget = order.budget?.micros ?? 0n;
  const spent = order.spent?.micros ?? 0n;
  const used = budget > 0n ? Number((spent * 1000n) / budget) / 10 : 0;
  return (
    <div className={styles.order}>
      <div className={styles.name}>
        {order.night && (
          <Link href={nightHref(order.night)}>
            {order.night.roomTypeId}, {shortDate(order.night.date)}
          </Link>
        )}
        <span className={`${styles.pill} ${PILL[order.status] ?? ""}`}>
          <i aria-hidden="true" />
          {STATUS[order.status] ?? "Unknown"}
        </span>
        <p className={text.mono}>Agent wallet {order.walletAddress}</p>
      </div>
      <div className={styles.bud}>
        <span className={styles.track} aria-hidden="true">
          <i style={{ width: `${Math.min(100, used)}%` }} />
        </span>
        <small className={text.num}>
          {usd(spent, 2)} of {usd(budget, 2)} spent
        </small>
      </div>
      <span className={`${styles.size} ${text.num}`}>
        {formatRoomNights(order.size?.tenths ?? 0)} rn
      </span>
      <div>
        {order.status === 1 && (
          <Button
            variant="primary"
            size="sm"
            disabled={!canApprove}
            onClick={onApprove}
          >
            Approve with World ID
          </Button>
        )}
      </div>
    </div>
  );
}
