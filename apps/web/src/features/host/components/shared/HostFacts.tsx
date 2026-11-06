import type { HostKpis, Payout } from "@night-shares/proto/host/v1/hotel_pb";
import { formatUsdc } from "../../../../shared/format";
import type { sumPayouts } from "../../model/host-view";

export function Kpis({ value }: { value?: HostKpis }) {
  if (!value) return null;
  return (
    <dl>
      <dt>Revenue, next 30 nights</dt>
      <dd>{formatUsdc(value.revenue?.micros ?? 0n)}</dd>
      <dt>Occupancy, next 30 nights</dt>
      <dd>{value.occupancyBps / 100}%</dd>
      <dt>Average rate</dt>
      <dd>{formatUsdc(value.averageRate?.micros ?? 0n)}</dd>
      <dt>Available now</dt>
      <dd>{formatUsdc(value.availableNow?.micros ?? 0n)}</dd>
    </dl>
  );
}

export function PayoutFacts({
  value,
}: {
  value?: Payout | ReturnType<typeof sumPayouts>;
}) {
  if (!value) return null;
  return (
    <dl>
      <dt>Available now</dt>
      <dd>{formatUsdc(value.availableNow?.micros ?? 0n)}</dd>
      <dt>Held while traders hold rooms</dt>
      <dd>{formatUsdc(value.heldForTraders?.micros ?? 0n)}</dd>
      <dt>Fees earned</dt>
      <dd>{formatUsdc(value.fees?.micros ?? 0n)}</dd>
    </dl>
  );
}

export function ErrorMessage({
  error,
}: {
  error?: { message: string } | null;
}) {
  return error ? (
    <p role="alert" style={{ color: "var(--neg)" }}>
      {error.message}
    </p>
  ) : null;
}
