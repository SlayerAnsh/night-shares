import { expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { createHarness } from "./harness";

const night = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  date: "2026-12-10",
};
const key = `${night.propertyId}:${night.roomTypeId}:${night.date}`;
const selection = {
  propertyId: night.propertyId,
  roomTypeId: night.roomTypeId,
  checkIn: night.date,
  checkOut: "2026-12-11",
  adults: 2,
  rooms: 1,
};
const guestDetails = {
  guestName: "Recall Guest",
  guestEmail: "recall@example.test",
};
const maxTotal = { micros: 1000000000n };

function emptyPool(h: Awaited<ReturnType<typeof createHarness>>) {
  h.container.ports.inventory.update(key, (record) => ({
    ...record,
    state: {
      ...record.state,
      F: 100,
      k: 0,
      S: 10,
      q: 0,
      held: 0,
      booked: 0,
      traderAsks: [],
    },
  }));
}

test("guest recalls largest holder first and pays holders strike minus 1.3%", async () => {
  const h = await createHarness();
  try {
    emptyPool(h);
    const small = await h.signInAs("orb", "recall_small");
    const large = await h.signInAs("orb", "recall_large");
    const guest = await h.signInAs("device", "recall_guest");
    await small.clients.market.buy({ night, size: { tenths: 20 }, maxTotal });
    await large.clients.market.buy({ night, size: { tenths: 30 }, maxTotal });
    const { inventory, walletProvider: wallet } = h.container.ports;
    inventory.update(key, (record) => ({
      ...record,
      state: { ...record.state, q: 10, booked: 5 },
    }));
    const smallBefore = await wallet.balance(small.user.walletAddress);
    const largeBefore = await wallet.balance(large.user.walletAddress);
    const { quote } = await guest.clients.stay.quoteStay({
      selection: { ...selection, rooms: 4 },
    });
    const lock = await guest.clients.stay.lockQuote({ quoteId: quote?.id });
    await guest.clients.stay.createBooking({
      ...guestDetails,
      lockId: lock.lockId,
    });
    // The flat pool's recall strike is 125 USDC per room night.
    expect(await wallet.balance(large.user.walletAddress)).toBe(
      largeBefore + 370125000n,
    );
    expect(await wallet.balance(small.user.walletAddress)).toBe(
      smallBefore + 123375000n,
    );
    expect((await large.clients.market.getPortfolio({})).holdings).toHaveLength(
      0,
    );
    expect(
      (await small.clients.market.getPortfolio({})).holdings[0]?.size?.tenths,
    ).toBe(10);
    expect(inventory.get(key).state).toMatchObject({
      held: 1,
      booked: 9,
      q: 10,
    });
  } finally {
    await h.close();
  }
});

test("booking rejects sold-out night without partial inventory or payment", async () => {
  const h = await createHarness();
  try {
    emptyPool(h);
    const guest = await h.signInAs("device", "sold_out_guest");
    const { quote } = await guest.clients.stay.quoteStay({ selection });
    const lock = await guest.clients.stay.lockQuote({ quoteId: quote?.id });
    const { inventory, walletProvider: wallet } = h.container.ports;
    inventory.update(key, (record) => ({
      ...record,
      state: { ...record.state, q: 10, booked: 10, held: 0 },
    }));
    const before = await wallet.balance(guest.user.walletAddress);
    await expect(
      guest.clients.stay.createBooking({
        ...guestDetails,
        lockId: lock.lockId,
      }),
    ).rejects.toMatchObject({
      code: Code.FailedPrecondition,
      rawMessage: "This night is sold out.",
    });
    expect(await wallet.balance(guest.user.walletAddress)).toBe(before);
    expect(inventory.get(key).state).toMatchObject({
      held: 0,
      booked: 10,
      q: 10,
    });
    expect((await guest.clients.stay.listTrips({})).upcoming).toHaveLength(0);
  } finally {
    await h.close();
  }
});

test("main and agent wallets share the 30% human cap on a non-peak night", async () => {
  const h = await createHarness();
  try {
    emptyPool(h);
    const { clients } = await h.signInAs("orb", "combined_cap");
    const market = clients.market;
    await market.buy({ night, size: { tenths: 20 }, maxTotal });
    await market.fundAgentWallet({ amount: maxTotal });
    await market.setAgentBudget({
      totalBudget: maxTotal,
      perOrderCap: maxTotal,
    });
    const order = await market.createAgentOrder({
      night,
      size: { tenths: 10 },
      budget: maxTotal,
    });
    expect(order.order?.status).toBe(AgentOrderStatus.EXECUTED);
    expect((await market.getPortfolio({})).holdings[0]?.size?.tenths).toBe(30);
    const seller = await h.signInAs("orb", "cap_ask_seller");
    await seller.clients.market.buy({ night, size: { tenths: 1 }, maxTotal });
    await seller.clients.market.postAsk({
      night,
      size: { tenths: 1 },
      price: { micros: 1000000n },
    });
    await expect(
      market.buy({ night, size: { tenths: 1 }, maxTotal }),
    ).rejects.toThrow("Per-human cap exceeded.");
    await expect(
      market.createAgentOrder({ night, size: { tenths: 1 }, budget: maxTotal }),
    ).rejects.toThrow("Per-human cap exceeded.");
  } finally {
    await h.close();
  }
});

test("host pays full trading fees and its host share goes to rebate pool", async () => {
  const h = await createHarness();
  try {
    emptyPool(h);
    const host = await h.signInAs("orb", "host");
    const wallet = h.container.ports.walletProvider;
    const before = await wallet.balance(host.user.walletAddress);
    const rebateBefore = await wallet.balance("rebate_pool");
    await host.clients.market.buy({ night, size: { tenths: 10 }, maxTotal });
    expect(await wallet.balance(host.user.walletAddress)).toBe(
      before - 101300000n,
    );
    expect(await wallet.balance("rebate_pool")).toBe(rebateBefore + 1000000n);
    expect(
      (await host.clients.market.getPortfolio({})).holdings[0]?.isHost,
    ).toBe(true);
    const publicBook = await h.clients.market.getBook({ night });
    expect(publicBook.holders.find((holder) => holder.isHost)).toMatchObject({
      walletAddress: host.user.walletAddress,
      size: { tenths: 10 },
    });
    await host.clients.market.sell({
      night,
      size: { tenths: 10 },
      minTotal: { micros: 0n },
    });
    expect(await wallet.balance(host.user.walletAddress)).toBe(
      before - 2600000n,
    );
    expect(await wallet.balance("rebate_pool")).toBe(rebateBefore + 2000000n);
    expect(
      (await h.clients.market.getNight({ night })).stats?.hostSoldBack,
    ).toBe(true);
  } finally {
    await h.close();
  }
});
