import { type BuyResult, toMicros } from "@night-shares/market-model";
import type { Ports } from "../../../../container/ports";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import { toWholeTenths } from "../../../../shared/tenths";
import type { NightRecord } from "../../../inventory/inventory-repo";
import { createSqliteMarketRepo } from "../../../market/repo/market-repo.sqlite";
import { realise, syncPosition } from "../../../market/use-cases/context";
import { humanWallets } from "../../../market/use-cases/human-wallets";
import { tradeFeePayments } from "../../../market/use-cases/trading/host-fees";

// Seeded inventory belongs to the mock market maker until a human buys it.
export function reserveRecall(
  ports: Ports,
  before: NightRecord,
  route: BuyResult,
  next: NightRecord,
) {
  toWholeTenths(route.filled);
  for (const fill of route.fills) toWholeTenths(fill.take);
  const repo = createSqliteMarketRepo(ports.db);
  const holders = repo.holders(before.key).map((user) => {
    const position = syncPosition({ ports, repo }, user, before);
    const previous = { ...position };
    syncPosition({ ports, repo }, user, next);
    return {
      user,
      position,
      previous,
      wallets: humanWallets(ports, user, before.propertyId),
    };
  });
  const known = holders.reduce(
    (sum, h) => sum + h.previous.free + h.previous.escrow,
    0,
  );
  const anonymousAsks = route.fills
    .filter(
      (f) =>
        f.src === "trader" && !holders.some((h) => h.wallets.has(f.who ?? "")),
    )
    .reduce((sum, f) => sum + toWholeTenths(f.take), 0);
  const candidates: {
    holder: (typeof holders)[number] | undefined;
    size: number;
    wallet: string;
  }[] = holders.map((h) => ({
    holder: h,
    size: h.position.free + h.position.escrow,
    wallet: h.user.walletAddress,
  }));
  candidates.push({
    holder: undefined,
    size: Math.max(0, toWholeTenths(before.state.held) - known - anonymousAsks),
    wallet: SYSTEM_ADDRESSES.marketMaker,
  });
  candidates.sort(
    (a, b) => b.size - a.size || a.wallet.localeCompare(b.wallet),
  );
  const payments: { to: string; amount: bigint }[] = [];
  const removed: typeof next.state.traderAsks = [];
  for (const fill of route.fills.filter((f) => f.src === "recall")) {
    let left = toWholeTenths(fill.take);
    for (const candidate of candidates) {
      const take = Math.min(left, candidate.size);
      if (!take) continue;
      const gross = toMicros((fill.price * take) / 10);
      const fee = toMicros(((fill.price * take) / 10) * 0.013);
      payments.push(
        { to: candidate.wallet, amount: gross - fee },
        ...tradeFeePayments(
          ports,
          before.propertyId,
          candidate.holder?.user ?? candidate.wallet,
          gross,
          fee,
        ),
      );
      const h = candidate.holder;
      if (h) {
        const free = Math.min(h.position.free, take);
        h.position.free -= free;
        h.position.escrow -= take - free;
        realise(h.position, take, gross - fee);
      }
      // Cancel recalled listed tokens, including seeded maker asks above X.
      let listed = h ? take - Math.min(h.previous.free, take) : take;
      next = {
        ...next,
        state: {
          ...next.state,
          traderAsks: next.state.traderAsks.flatMap((ask) => {
            const wallet =
              ask.who === "mm-bot" ? SYSTEM_ADDRESSES.marketMaker : ask.who;
            if (
              !(h
                ? h.wallets.has(wallet ?? "")
                : wallet === candidate.wallet) ||
              listed <= 0
            )
              return [ask];
            const count = Math.min(listed, toWholeTenths(ask.size));
            listed -= count;
            removed.push({ ...ask, size: count / 10 });
            return count === toWholeTenths(ask.size)
              ? []
              : [{ ...ask, size: (toWholeTenths(ask.size) - count) / 10 }];
          }),
        },
      };
      candidate.size -= take;
      left -= take;
      if (!left) break;
    }
    if (left)
      throw new DomainError("FAILED_PRECONDITION", "This night is sold out.");
  }
  const reserved = holders.map((h) => ({ ...h.position }));
  return {
    next,
    payments,
    revert(record: NightRecord) {
      for (const [i, h] of holders.entries()) {
        const after = reserved[i];
        if (!after) continue;
        h.position.free += h.previous.free - after.free;
        h.position.escrow += h.previous.escrow - after.escrow;
        h.position.realised += h.previous.realised - after.realised;
        h.position.closed += h.previous.closed - after.closed;
        h.position.wins += h.previous.wins - after.wins;
        h.position.returns += h.previous.returns - after.returns;
      }
      const asks = record.state.traderAsks.map((a) => ({ ...a }));
      for (const ask of removed) {
        const existing = asks.find(
          (a) => a.who === ask.who && a.price === ask.price,
        );
        if (existing)
          existing.size =
            (toWholeTenths(existing.size) + toWholeTenths(ask.size)) / 10;
        else asks.push(ask);
      }
      return { ...record, state: { ...record.state, traderAsks: asks } };
    },
  };
}
