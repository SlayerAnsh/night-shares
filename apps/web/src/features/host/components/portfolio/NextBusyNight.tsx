"use client";
import { useNextBusy } from "../../hooks/use-next-busy";
import { ErrorMessage } from "../shared/HostFacts";

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
  if (query.isPending) return <span>Loading…</span>;
  if (query.error) return <ErrorMessage error={query.error} />;
  if (busy) return <a href={`/host/${propertyId}/${busy}`}>{busy}</a>;
  if (hasMore)
    return (
      <NextBusyNight propertyId={propertyId} from={from} month={nextMonth} />
    );
  return <span>None in the next 120 nights</span>;
}
