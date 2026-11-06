"use client";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { useAccount } from "../../hooks/use-account";
import { money, nightHref } from "../../model/market";
import { Feedback } from "./Feedback";
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
  return (
    <section>
      <h2>Your listings</h2>
      <Feedback
        error={account.portfolio.error?.message || account.actions.error}
        notice={account.actions.notice}
      />
      {!rows.length && <p>No listings.</p>}
      <ul>
        {rows.map((ask) => (
          <li key={ask.id}>
            {ask.night && (
              <Link href={`${nightHref(ask.night)}?mode=ask`}>
                {ask.night.date} · {ask.night.roomTypeId}
              </Link>
            )}{" "}
            · {formatRoomNights(ask.size?.tenths ?? 0)} room nights at{" "}
            {money(ask.price)}{" "}
            <button
              type="button"
              disabled={account.actions.pending}
              onClick={() => void account.cancel(ask.id)}
            >
              Cancel ask
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
