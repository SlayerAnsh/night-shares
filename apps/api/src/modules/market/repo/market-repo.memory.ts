import type { User } from "../../../ports/sessions/session-store";
import { assertIntegerTenths } from "../../../shared/tenths";
import type { Account, MarketRepo } from "./market-repo";
export function createMemoryMarketRepo(): MarketRepo {
  const users = new Map<string, User>();
  const accounts = new Map<string, Account>();
  const queues = new Map<string, Promise<unknown>>();
  const account = (id: string): Account => {
    let value = accounts.get(id);
    if (!value) {
      value = { positions: new Map(), watch: new Set(), orders: new Map() };
      accounts.set(id, value);
    }
    return value;
  };
  return {
    remember(user) {
      users.set(user.humanId, user);
    },
    holders(key) {
      return [...users.values()].filter((user) => {
        const p = account(user.humanId).positions.get(key);
        return p && p.free + p.escrow > 0;
      });
    },
    account,
    position(id, key) {
      const positions = account(id).positions;
      let position = positions.get(key);
      if (!position) {
        position = {
          free: 0,
          average: 0n,
          realised: 0n,
          escrow: 0,
          askPrice: 0n,
          closed: 0,
          wins: 0,
          returns: 0,
        };
        position = new Proxy(position, {
          set(target, field, value) {
            if (field === "free" || field === "escrow")
              assertIntegerTenths(value);
            return Reflect.set(target, field, value);
          },
        });
        positions.set(key, position);
      }
      return position;
    },
    async exclusive(id, work) {
      const previous = queues.get(id) ?? Promise.resolve();
      const result = previous.then(work, work);
      queues.set(id, result);
      try {
        return await result;
      } finally {
        if (queues.get(id) === result) queues.delete(id);
      }
    },
  };
}
