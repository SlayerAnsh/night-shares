import { askFillProceeds, book, toMicros } from "@night-shares/market-model";
import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import { assertTrading } from "../../../ports/chain-status/chain-status";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { mulTenths } from "../../../shared/money";
import { format, type NightIdentity } from "../../../shared/night-key";
import { toWholeTenths } from "../../../shared/tenths";
import type { NightRecord } from "../../inventory/inventory-repo";
import { cutoffAt } from "../cutoff";
import { reconcileSigned } from "../orders/inventory";
import { signedAsks } from "../orders/store";
import type { MarketRepo, Position } from "../repo/market-repo";
import { humanWallets } from "./human-wallets";
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
  record.cutoffAt ?? Date.parse(`${record.date}T14:00:00Z`);
export const hoursLeft = (ports: Ports, record: NightRecord) =>
  Math.max(0, (cutoffAt(ports, record) - ports.clock.now()) / 3_600_000);
export function bookOf(
  ports: Ports,
  record: NightRecord,
  wallet?: string | ReadonlySet<string>,
) {
  return book({
    ...record.state,
    levels: Math.max(80, toWholeTenths(record.state.S)),
    hoursLeft: hoursLeft(ports, record),
    traderAsks: record.state.traderAsks.filter((a) =>
      typeof wallet === "string" ? a.who !== wallet : !wallet?.has(a.who ?? ""),
    ),
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
export function syncPosition(
  { repo, ports }: Deps,
  user: User,
  record: NightRecord,
) {
  return transaction(ports.db, () => {
    repo.remember(user);
    const position = repo.position(user.humanId, record.key);
    if (
      signedAsks(ports.db, record.key).some((a) => a.human_id === user.humanId)
    ) {
      reconcileSigned(ports, record);
      return position;
    }
    const wallets = humanWallets(ports, user, record.propertyId);
    const remaining = record.state.traderAsks
      .filter((a) => wallets.has(a.who ?? ""))
      .reduce((sum, a) => sum + toWholeTenths(a.size), 0);
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
  });
}
export function assertOpen(ports: Ports, record: NightRecord) {
  assertTrading(ports, record.key);
  if (record.released)
    throw new DomainError("FAILED_PRECONDITION", "This night has closed.");
  if (record.stopped || hoursLeft(ports, record) <= 0)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "This night is no longer trading.",
    );
}
