"use client";
import { Button, buttonClass, EmptyState } from "@night-shares/design-system";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { TxStatus } from "../../../../shared/tx/TxStatus";
import { useAccount } from "../../hooks/use-account";
import { shortDate, usd } from "../../model/display";
import { nightHref } from "../../model/market";
import { Section } from "../ui/Section";
import text from "../ui/text.module.css";
import { Feedback } from "./Feedback";
import styles from "./lists.module.css";

// Room nights you offered for sale. Guests and traders can buy them until release.
export function Listings({
  night,
}: {
  night?: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
}) {
  const account = useAccount();
  if (account.level !== "orb") return null;
  const rows =
    account.portfolio.data?.listings.filter(
      (ask) =>
        !night || (ask.night && nightHref(ask.night) === nightHref(night)),
    ) ?? [];
  // Open listings on any night: one on-chain cancel touches all of one wallet.
  const mine = account.portfolio.data?.listings ?? [];
  return (
    <Section
      id={night ? "h-lst-night" : "h-lst"}
      title={night ? "Your listings on this night" : "Open listings"}
      line={`${rows.length ? `${rows.length} ${rows.length === 1 ? "listing" : "listings"}. ` : ""}Guests and traders can buy them until release.`}
      plain={!!night}
    >
      {account.cancelling ? (
        <TxStatus phase="pending" title="Cancelling your listing">
          {account.cancelling.others > 0
            ? "Waiting for the receipt. A cancel on chain clears all your signed listings, so your others are signed again right after."
            : "Waiting for the receipt."}
        </TxStatus>
      ) : (
        <Feedback
          error={account.portfolio.error?.message || account.actions.error}
          notice={account.actions.notice}
        />
      )}
      {rows.length ? (
        <div className={styles.lists}>
          {rows.map((ask) => (
            <div key={ask.id} className={styles.lst}>
              <div>
                {ask.night && (
                  <>
                    <b>{ask.night.propertyId}</b>{" "}
                    <span className={text.muted}>
                      {ask.night.roomTypeId}, {shortDate(ask.night.date)}
                    </span>
                  </>
                )}
                <span className={`${styles.q} ${text.num}`}>
                  {formatRoomNights(ask.size?.tenths ?? 0)} rn at{" "}
                  {usd(ask.price?.micros, 2)}
                </span>
              </div>
              <div className={styles.acts}>
                {ask.night && (
                  <Link
                    className={buttonClass({ size: "sm" })}
                    href={`${nightHref(ask.night)}?mode=ask`}
                  >
                    Edit
                  </Link>
                )}
                <Button
                  size="sm"
                  title="On-chain cancellation revokes old signatures and automatically re-signs your other open listings."
                  disabled={account.actions.pending}
                  onClick={() =>
                    void account.cancel(
                      ask.id,
                      mine.filter((a) => a.maker === ask.maker).length - 1,
                    )
                  }
                >
                  {account.cancelling?.id === ask.id ? "Cancelling…" : "Cancel"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState plain>Nothing listed.</EmptyState>
      )}
    </Section>
  );
}
