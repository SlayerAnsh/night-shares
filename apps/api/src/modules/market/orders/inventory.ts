import {
  askFillProceeds,
  toMicros,
  toTenths,
} from "@night-shares/market-model";
import type { Ports } from "../../../container/ports";
import { transaction } from "../../../db/transaction";
import { mulTenths } from "../../../shared/money";
import type {
  InventoryRepo,
  NightRecord,
} from "../../inventory/inventory-repo";
import type { MarketRepo } from "../repo/market-repo";
import { createSqliteMarketRepo } from "../repo/market-repo.sqlite";
import { isLive, signedAsks } from "./store";

type Frame = {
  sizes: Map<string, number>;
  free: Map<string, number>;
  repo: MarketRepo;
};
const frames = new WeakMap<Ports, Frame>();
// Guest recall observes seller balances inside the inventory callback, before choosing holders.
export function reconcileSigned(ports: Ports, record: NightRecord) {
  const frame = frames.get(ports);
  if (!frame) return;
  for (const ask of signedAsks(ports.db, record.key)) {
    if (!frame.sizes.has(ask.maker)) continue;
    const previous = frame.sizes.get(ask.maker) ?? 0;
    const remaining = toTenths(
      record.state.traderAsks.find((a) => a.who === ask.maker)?.size ?? 0,
    );
    const filled = previous - remaining;
    if (!filled || (filled > 0 && ask.status !== "open")) continue;
    const position = frame.repo.position(ask.human_id, record.key);
    // Booking compensation already restores the holder snapshot before restoring asks.
    const restored =
      filled < 0 &&
      position.free - (frame.free.get(ask.maker) ?? position.free) >= -filled;
    if (!restored) {
      const amount = Math.abs(filled);
      const cost = mulTenths(position.average, amount);
      const proceeds = toMicros(
        askFillProceeds(Number(ask.price) / 1e6, amount / 10).net,
      );
      const pnl = proceeds - cost;
      const direction = Math.sign(filled);
      position.free -= filled;
      position.realised += BigInt(direction) * pnl;
      position.closed += direction;
      position.wins += pnl > 0n ? direction : 0;
      position.returns += cost ? direction * Number((pnl * 10000n) / cost) : 0;
    }
    ports.db
      .query(
        "UPDATE market_signed_asks SET remaining = remaining - ?, status = CASE WHEN status IN ('cancelled', 'expired') THEN status WHEN remaining - ? > 0 THEN 'open' ELSE 'filled' END WHERE night_key = ? AND maker = ?",
      )
      .run(filled, filled, record.key, ask.maker);
    frame.sizes.set(ask.maker, remaining);
  }
}
export function signedInventory(
  ports: Ports,
  raw: InventoryRepo,
  repo = createSqliteMarketRepo(ports.db),
): InventoryRepo {
  function visible(record: NightRecord) {
    const orders = signedAsks(ports.db, record.key);
    return {
      ...record,
      state: {
        ...record.state,
        traderAsks: record.state.traderAsks.flatMap((a) => {
          const ask = orders.find((o) => o.maker === a.who);
          if (!ask) return [a];
          if (!isLive(ports.db, ask, ports.clock.now())) return [];
          const holding = repo.position(ask.human_id, record.key).free;
          const size = Math.min(
            toTenths(a.size),
            Number(ask.remaining),
            holding,
          );
          return size > 0 ? [{ ...a, size: size / 10 }] : [];
        }),
      },
    };
  }
  return {
    get: (key) => visible(raw.get(key)),
    seedNight: (night) => visible(raw.seedNight(night)),
    list: (filter) => raw.list(filter).map(visible),
    save: (record) => raw.save(record),
    update(key, mutate) {
      return transaction(ports.db, () =>
        raw.update(key, (original) => {
          const before = visible(original);
          const orders = signedAsks(ports.db, key);
          const frame: Frame = { sizes: new Map(), free: new Map(), repo };
          for (const ask of orders) {
            frame.sizes.set(
              ask.maker,
              toTenths(
                before.state.traderAsks.find((a) => a.who === ask.maker)
                  ?.size ?? 0,
              ),
            );
            frame.free.set(ask.maker, repo.position(ask.human_id, key).free);
          }
          frames.set(ports, frame);
          try {
            const next = mutate(before);
            if (next.released || before.released) return next;
            reconcileSigned(ports, next);
            // Visibility is capped by current balance, but does not consume unfilled order size.
            const asks = next.state.traderAsks.filter(
              (a) => !orders.some((o) => o.maker === a.who),
            );
            for (const order of orders) {
              const prior = original.state.traderAsks.find(
                (a) => a.who === order.maker,
              );
              const visibleBefore = before.state.traderAsks.find(
                (a) => a.who === order.maker,
              );
              const after = next.state.traderAsks.find(
                (a) => a.who === order.maker,
              );
              const size =
                toTenths(prior?.size ?? 0) -
                toTenths(visibleBefore?.size ?? 0) +
                toTenths(after?.size ?? 0);
              const template = after ?? prior;
              if (size > 0 && template)
                asks.push({ ...template, size: size / 10 });
              if (repo.position(order.human_id, key).free === 0)
                ports.db
                  .query(
                    "UPDATE market_signed_asks SET status = 'unfillable' WHERE night_key = ? AND maker = ? AND status = 'open'",
                  )
                  .run(key, order.maker);
            }
            return { ...next, state: { ...next.state, traderAsks: asks } };
          } finally {
            frames.delete(ports);
          }
        }),
      );
    },
  };
}
