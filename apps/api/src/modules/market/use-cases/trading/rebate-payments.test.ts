import { expect, test } from "bun:test";
import { routeBuy } from "@night-shares/market-model";
import { fixture } from "../../testing/fixture";
import { rebatePayments } from "./rebate-payments";

test("multiple asks share one exact ledger balance cap", async () => {
  const d = await fixture();
  try {
    const wallet = d.ports.walletProvider;
    await wallet.transfer(
      "rebate_pool",
      "treasury",
      (await wallet.balance("rebate_pool")) - 600000n,
      "drain",
    );
    const result = routeBuy(
      {
        recall: 200,
        bids: [],
        asks: [
          { src: "trader", price: 100, size: 1, who: "first" },
          { src: "trader", price: 100, size: 1, who: "second" },
        ],
      },
      2,
    );
    const state = { ...d.ports.inventory.get(d.key).state, F: 100, k: 0 };
    const legs = await rebatePayments(wallet, result, state, "market_maker");
    expect(legs.map(({ to, amount }) => ({ to, amount }))).toEqual([
      { to: "first", amount: 500000n },
      { to: "second", amount: 100000n },
    ]);
  } finally {
    d.ports.db.close();
  }
});

test("pool fills advance the comparison price before the following ask", async () => {
  const d = await fixture();
  try {
    const state = {
      ...d.ports.inventory.get(d.key).state,
      F: 100,
      k: 1,
      S: 10,
      q: 0,
    };
    const result = routeBuy(
      {
        recall: 200,
        bids: [],
        asks: [
          { src: "pool", price: 105, size: 1, guestOnly: false },
          { src: "trader", price: 110, size: 1, who: "maker" },
        ],
      },
      2,
    );
    const legs = await rebatePayments(
      d.ports.walletProvider,
      result,
      state,
      "market_maker",
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]?.amount).toBe(550000n);
  } finally {
    d.ports.db.close();
  }
});
