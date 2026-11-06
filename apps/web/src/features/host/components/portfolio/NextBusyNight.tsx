"use client";
import Link from "next/link";
import { useNextBusy } from "../../hooks/use-next-busy";
import { shortNight } from "../../model/calendar";

/** First night in the next 120 that is at least 80% booked or held. */
export function NextBusyNight({
  propertyId,
  from,
  month,
}: {
  propertyId: string;
  from: string;
  month: string;
}) {
  const { query, busy, nextMonth, hasMore } = useNextBusy(
    propertyId,
    from,
    month,
  );
  if (query.isPending) return <span>…</span>;
  if (query.error) return <span title={query.error.message}>Unavailable</span>;
  if (busy)
    return <Link href={`/host/${propertyId}/${busy}`}>{shortNight(busy)}</Link>;
  if (hasMore)
    return (
      <NextBusyNight propertyId={propertyId} from={from} month={nextMonth} />
    );
  return <span>None soon</span>;
}
