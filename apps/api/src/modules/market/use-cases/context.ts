import {
  askFillProceeds,
  book,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { parseDate } from "../../../shared/dates";
import { DomainError } from "../../../shared/errors/domain-error";
import { mulTenths } from "../../../shared/money";
import { format, type NightIdentity } from "../../../shared/night-key";
import type { NightRecord } from "../../inventory/inventory-repo";
import type { MarketRepo, Position } from "../repo/market-repo";
export type Deps = { ports: Ports; repo: MarketRepo };
export function nightKey(night?: NightIdentity) {
  if (!night) throw new DomainError("INVALID_ARGUMENT", "Choose a night.");
  return format(night);
}
export function quantity(size?: { tenths: number }) {
  if (!size || !Number.isSafeInteger(size.tenths) || size.tenths <= 0)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Size must be positive integer tenths.",
    );
  return size.tenths;
}
export const releaseAt = (record: NightRecord) =>
  parseDate(record.date) + 14 * 3_600_000;
export const hoursLeft = (ports: Ports, record: NightRecord) =>
  Math.max(0, (releaseAt(record) - ports.clock.now()) / 3_600_000);
export function bookOf(ports: Ports, record: NightRecord, wallet?: string) {
  return book({
    ...record.state,
    levels: Math.max(80, toTenths(record.state.S)),
    hoursLeft: hoursLeft(ports, record),
    traderAsks: record.state.traderAsks.filter((a) => a.who !== wallet),
  });
}
export function realise(position: Position, size: number, proceeds: bigint) {
  const cost = mulTenths(position.average, size);
  const pnl = proceeds - cost;
  position.realised += pnl;
  position.closed++;
  position.wins += pnl > 0n ? 1 : 0;
  position.returns += cost ? Number((pnl * 10000n) / cost) : 0;
}
export function syncPosition({ repo }: Deps, user: User, record: NightRecord) {
  const position = repo.position(user.humanId, record.key);
  const ask = record.state.traderAsks.find((a) => a.who === user.walletAddress);
  const remaining = ask ? toTenths(ask.size) : 0;
  const filled = position.escrow - remaining;
  if (filled > 0)
    realise(
      position,
      filled,
      toMicros(
        askFillProceeds(Number(position.askPrice) / 1e6, filled / 10).net,
      ),
    );
  position.escrow = remaining;
  return position;
}
export function assertOpen(ports: Ports, record: NightRecord) {
  if (record.stopped || hoursLeft(ports, record) <= 0)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "This night is no longer trading.",
    );
}
