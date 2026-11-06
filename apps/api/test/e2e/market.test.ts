import { afterAll, beforeAll, expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { TapeActor } from "@night-shares/proto/market/v1/analytics_pb";
import { BookSource } from "@night-shares/proto/market/v1/book_pb";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { createHarness } from "./harness";

let harness: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  harness = await createHarness();
});
afterAll(async () => {
  await harness?.close();
});
const night = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  date: "2026-12-01",
};
test("discover, detail, book, quote, buy, list, cancel and late sell-back", async () => {
  const { clients } = await harness.signInAs("orb", "market_flow");
  const market = clients.market;
  expect((await market.discover({})).nights).toHaveLength(900);
  const detail = await market.getNight({ night });
  expect(detail.priceHistory).toHaveLength(31);
  expect(detail.monthCalendar).toHaveLength(31);
  expect((await market.getBook({ night })).lateFeeBps).toBeGreaterThan(130);
  const quote = (await market.quoteBuy({ night, size: { tenths: 5 } })).quote;
  const execution = await market.buy({
    night,
    size: { tenths: 5 },
    maxTotal: quote?.total,
  });
  expect(execution.execution?.quote?.filled?.tenths).toBe(5);
  expect((await market.getPortfolio({})).holdings[0]?.size?.tenths).toBe(5);
  const posted = await market.postAsk({
    night,
    size: { tenths: 3 },
    price: { micros: 1000000n },
  });
  const publicBook = await harness.clients.market.getBook({ night });
  expect(
    publicBook.asks.some(
      (a) => a.source === BookSource.TRADER && a.askId === posted.ask?.id,
    ),
  ).toBe(true);
  await market.cancelAsk({ askId: posted.ask?.id });
  expect((await market.getPortfolio({})).listings).toHaveLength(0);
  const sellQuote = (await market.quoteSell({ night, size: { tenths: 5 } }))
    .quote;
  expect(sellQuote?.lateFee?.micros).toBeGreaterThan(0n);
  await market.sell({ night, size: { tenths: 5 }, minTotal: sellQuote?.total });
  expect((await market.getPortfolio({})).holdings).toHaveLength(0);
  expect(
    (await market.listTape({ night })).prints.length,
  ).toBeGreaterThanOrEqual(2);
  expect((await market.listTape({ night })).prints[0]?.actor).toBe(
    TapeActor.YOU,
  );
  expect(
    (await harness.clients.market.listTape({ night })).prints[0]?.actor,
  ).toBe(TapeActor.SELL_BACK);
  expect((await market.toggleWatch({ night })).isWatched).toBe(true);
  expect((await market.listWatch({})).nights).toHaveLength(1);
  expect((await market.discover({ watchlist: true })).nights).toHaveLength(1);
  expect((await market.toggleWatch({ night })).isWatched).toBe(false);
});
test("buy rejects over-cap size and Device user", async () => {
  const orb = await harness.signInAs("orb", "market_cap");
  await expect(
    orb.clients.market.buy({
      night,
      size: { tenths: 10000 },
      maxTotal: { micros: 10n ** 12n },
    }),
  ).rejects.toMatchObject({ code: Code.FailedPrecondition });
  const device = await harness.signInAs("device", "market_device");
  await expect(
    device.clients.market.buy({
      night,
      size: { tenths: 1 },
      maxTotal: { micros: 10n ** 12n },
    }),
  ).rejects.toMatchObject({ code: Code.PermissionDenied });
});
test("large agent order needs one-time verification token", async () => {
  const { clients, user } = await harness.signInAs("orb", "market_agent");
  const agentNight = { ...night, date: "2026-12-20" };
  const pending = await clients.market.createAgentOrder({
    night: agentNight,
    size: { tenths: 5 },
    budget: { micros: 3000000000n },
  });
  expect(pending.order?.status).toBe(AgentOrderStatus.PENDING);
  await expect(
    clients.market.approveAgentOrder({ orderId: pending.order?.id }),
  ).rejects.toMatchObject({ code: Code.PermissionDenied });
  const { token } = harness.container.ports.verifications.issue({
    userId: user.id,
    action: "approve_agent_order",
  });
  const approved = await clients.market.approveAgentOrder({
    orderId: pending.order?.id,
    verificationToken: token,
  });
  expect(approved.order?.status).toBe(AgentOrderStatus.EXECUTED);
  expect(approved.execution?.quote?.filled?.tenths).toBe(5);
  await expect(
    clients.market.approveAgentOrder({
      orderId: pending.order?.id,
      verificationToken: token,
    }),
  ).rejects.toMatchObject({ code: Code.FailedPrecondition });
});
